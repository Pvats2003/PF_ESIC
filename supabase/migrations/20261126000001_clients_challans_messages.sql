-- Phase 2 slice 2: add / edit clients, challan evidence, message templates for reminders.

-- ─── Add or edit a client (whitelisted fields; the table's checks validate phones and codes) ─
create or replace function public.save_client(p_client_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  id_ uuid := p_client_id;
  name_ text := nullif(trim(p_data->>'firm_name'), '');
  partner_ uuid;
begin
  perform public.require_app_user();
  if name_ is null then raise exception 'Firm name is needed' using errcode = 'P0001'; end if;
  if p_data ? 'partner_code' and nullif(p_data->>'partner_code', '') is not null then
    select id into partner_ from public.partners where code = p_data->>'partner_code';
    if not found then raise exception 'Unknown partner' using errcode = 'P0001'; end if;
  end if;
  if coalesce((p_data->>'default_charge_paise')::bigint, 0) < 0 then
    raise exception 'Service charge can''t be negative' using errcode = 'P0001';
  end if;

  if id_ is null then
    insert into public.clients (kind, firm_name, firm_name_hi, owner_name, phone, whatsapp_phone, alt_phone, address,
                                pf_establishment_code, esic_code, esic_code_verified, default_charge_paise, handled_by_partner_id,
                                challan_payer_default, preferred_language, active, notes)
    values (coalesce(p_data->>'kind', 'regular')::public.client_kind, name_, nullif(trim(p_data->>'firm_name_hi'), ''),
            nullif(trim(p_data->>'owner_name'), ''), nullif(p_data->>'phone', ''), nullif(p_data->>'whatsapp_phone', ''),
            nullif(p_data->>'alt_phone', ''), nullif(trim(p_data->>'address'), ''),
            nullif(upper(trim(p_data->>'pf_establishment_code')), ''), nullif(p_data->>'esic_code', ''),
            coalesce((p_data->>'esic_code_verified')::boolean, false), coalesce((p_data->>'default_charge_paise')::bigint, 0), partner_,
            coalesce(p_data->>'challan_payer_default', 'us')::public.challan_payer, coalesce(p_data->>'preferred_language', 'hi')::public.language_code,
            coalesce((p_data->>'active')::boolean, true), nullif(trim(p_data->>'notes'), ''))
    returning id into id_;
  else
    perform 1 from public.clients where id = id_ for update;
    if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;
    update public.clients set
      firm_name = name_,
      firm_name_hi = nullif(trim(p_data->>'firm_name_hi'), ''),
      owner_name = nullif(trim(p_data->>'owner_name'), ''),
      phone = nullif(p_data->>'phone', ''),
      whatsapp_phone = nullif(p_data->>'whatsapp_phone', ''),
      alt_phone = nullif(p_data->>'alt_phone', ''),
      address = nullif(trim(p_data->>'address'), ''),
      pf_establishment_code = nullif(upper(trim(p_data->>'pf_establishment_code')), ''),
      esic_code = nullif(p_data->>'esic_code', ''),
      esic_code_verified = coalesce((p_data->>'esic_code_verified')::boolean, false),
      default_charge_paise = coalesce((p_data->>'default_charge_paise')::bigint, 0),
      handled_by_partner_id = partner_,
      challan_payer_default = coalesce(p_data->>'challan_payer_default', 'us')::public.challan_payer,
      preferred_language = coalesce(p_data->>'preferred_language', 'hi')::public.language_code,
      active = coalesce((p_data->>'active')::boolean, true),
      notes = nullif(trim(p_data->>'notes'), '')
    where id = id_;
  end if;

  -- The firm name is always searchable as an alias.
  insert into public.client_aliases (client_id, raw_name, normalized_name)
  values (id_, name_, upper(regexp_replace(regexp_replace(name_, '[^A-Za-z0-9& ]+', ' ', 'g'), '\s+', ' ', 'g')))
  on conflict (normalized_name) do nothing;
  return id_;
end $$;

-- Attach the challan proof (PDF / screenshot already uploaded to storage). Once only.
create or replace function public.attach_challan_evidence(p_challan_id uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_app_user();
  if coalesce(trim(p_path), '') = '' then raise exception 'No file' using errcode = 'P0001'; end if;
  update public.challan_transactions set evidence_file_path = p_path
  where id = p_challan_id and not voided and evidence_file_path is null;
  if not found then raise exception 'Challan not found, void or already has a file' using errcode = 'P0001'; end if;
end $$;

-- Templates + business details for building WhatsApp messages in the app.
create or replace function public.message_setup() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'templates', (select jsonb_object_agg(k.key, k.langs) from (
                    select key, jsonb_object_agg(language, body) as langs from public.message_templates group by key) k),
    'business', (select jsonb_build_object('name_en', business_name_en, 'name_hi', business_name_hi, 'phones', phones, 'due_day', due_day)
                 from public.settings where id = 1)
  )
$$;

-- ─── Board rows also carry their latest receipt and challans (Today's queue, challan buttons) ─
create or replace function public.board(p_month date) returns jsonb
language sql stable set search_path = '' as $$
  with rows as (
    select s.monthly_record_id, s.client_id, s.wage_month, s.due_date, s.challan_payer, s.legacy_settled,
           s.due_to_us, s.received, s.owes, s.amount_status, s.notification_status, s.payment_status,
           s.pf_challan_status, s.esic_challan_status, s.receipt_status, s.receipt_shared, s.receipt_needs_reissue,
           s.overdue, s.overall_status,
           m.pf_paise, m.esic_paise, m.charge_paise, m.updated_at,
           c.firm_name, c.owner_name, c.phone, c.whatsapp_phone, c.preferred_language, c.esic_code_verified,
           (c.esic_code is not null) as has_esic_code,
           p.code as partner_code, p.name as partner_name,
           (select coalesce(sum(e.amount_paise), 0) from public.extra_charges e
              where e.client_id = s.client_id and e.wage_month = s.wage_month and not e.voided) as extras_paise,
           (select coalesce(array_agg(a.normalized_name), '{}') from public.client_aliases a where a.client_id = s.client_id) as aliases,
           (select r.id from public.payment_allocations pa join public.receipts r on r.payment_id = pa.payment_id and not r.voided
              where pa.monthly_record_id = s.monthly_record_id order by r.issued_at desc limit 1) as latest_receipt_id,
           (select jsonb_agg(jsonb_build_object('id', ct.id, 'type', ct.challan_type, 'trrn', ct.trrn, 'number', ct.challan_number,
                     'paid_on', ct.paid_on, 'paid_by', ct.paid_by, 'verified', ct.verified_at is not null, 'has_evidence', ct.evidence_file_path is not null))
              from public.challan_transactions ct where ct.monthly_record_id = s.monthly_record_id and not ct.voided) as challans
    from public.month_status s
    join public.monthly_records m on m.id = s.monthly_record_id
    join public.clients c on c.id = s.client_id
    left join public.partners p on p.id = s.handled_by_partner_id
    where s.wage_month = p_month
  )
  select jsonb_build_object(
    'month', p_month,
    'today', (now() at time zone 'Asia/Kolkata')::date,
    'due_day', (select due_day from public.settings where id = 1),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.firm_name) from rows r), '[]'::jsonb),
    'partners', (select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name) order by code) from public.partners where active),
    'not_started', (select count(*) from public.clients c
                    where c.active and c.kind = 'regular'
                      and not exists (select 1 from public.monthly_records m where m.client_id = c.id and m.wage_month = p_month))
  )
$$;


do $$
declare f text;
begin
  foreach f in array array['save_client(uuid, jsonb)', 'attach_challan_evidence(uuid, text)', 'message_setup()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
