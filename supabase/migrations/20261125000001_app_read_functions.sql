-- Phase 2 screens read and write ONLY through these functions (plus the money
-- functions from 20261124000001). Reads run as the signed-in user (security
-- invoker), so Row Level Security still applies; writes check is_app_user().
-- The app calls them with supabase.rpc() in production and `select fn(...)`
-- against a local Postgres in development and tests: same SQL either way.

-- ─── The month board: one row per client for a wage month ──────────────────
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
           (select coalesce(array_agg(a.normalized_name), '{}') from public.client_aliases a where a.client_id = s.client_id) as aliases
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
    'not_started', (select count(*) from public.clients c
                    where c.active and c.kind = 'regular'
                      and not exists (select 1 from public.monthly_records m where m.client_id = c.id and m.wage_month = p_month))
  )
$$;

-- ─── Client page ────────────────────────────────────────────────────────────
create or replace function public.client_detail(p_client_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'client', (select to_jsonb(c) || jsonb_build_object('partner_code', p.code, 'partner_name', p.name)
               from public.clients c left join public.partners p on p.id = c.handled_by_partner_id where c.id = p_client_id),
    'balance', (select jsonb_build_object('owes', b.owes_paise, 'advance', b.advance_paise) from public.client_balances b where b.client_id = p_client_id),
    'months', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.wage_month desc) from (
        select s.monthly_record_id, s.wage_month, s.due_date, s.challan_payer, s.due_to_us, s.received, s.owes,
               s.payment_status, s.pf_challan_status, s.esic_challan_status, s.receipt_status, s.overall_status, s.overdue,
               s.legacy_settled, m.pf_paise, m.esic_paise, m.charge_paise,
               (select coalesce(sum(e.amount_paise), 0) from public.extra_charges e
                  where e.client_id = p_client_id and e.wage_month = s.wage_month and not e.voided) as extras_paise,
               (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', ct.id, 'type', ct.challan_type, 'trrn', ct.trrn, 'number', ct.challan_number,
                         'amount', ct.amount_paise, 'paid_on', ct.paid_on, 'paid_by', ct.paid_by,
                         'verified', ct.verified_at is not null, 'has_evidence', ct.evidence_file_path is not null)), '[]'::jsonb)
                  from public.challan_transactions ct where ct.monthly_record_id = s.monthly_record_id and not ct.voided) as challans
        from public.month_status s join public.monthly_records m on m.id = s.monthly_record_id
        where s.client_id = p_client_id
      ) x), '[]'::jsonb),
    'open_months', coalesce((
      select jsonb_agg(jsonb_build_object('monthly_record_id', o.monthly_record_id, 'wage_month', o.wage_month, 'owes', o.owes) order by o.wage_month)
      from (select monthly_record_id, wage_month, sum(outstanding) as owes
            from public.client_outstanding(p_client_id) where monthly_record_id is not null
            group by monthly_record_id, wage_month having sum(outstanding) > 0) o), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'amount', p.amount_paise, 'received_on', p.received_on, 'mode', p.mode, 'reference', p.reference,
               'received_by', pr.name, 'voided', p.voided, 'void_reason', p.void_reason,
               'receipt_id', r.id, 'receipt_no', r.receipt_no) order by p.received_on desc, p.created_at desc)
      from public.payments p
      left join public.partners pr on pr.id = p.received_by_partner_id
      left join lateral (select id, receipt_no from public.receipts rr where rr.payment_id = p.id and not rr.voided
                         order by rr.issued_at desc limit 1) r on true
      where p.client_id = p_client_id), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('type', ml.type, 'language', ml.language, 'status', ml.status, 'sent_at', ml.sent_at)
                       order by ml.sent_at desc)
      from (select * from public.message_log where client_id = p_client_id order by sent_at desc limit 30) ml), '[]'::jsonb),
    'partners', (select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name) order by code) from public.partners where active),
    'today', (now() at time zone 'Asia/Kolkata')::date
  )
$$;

-- Everything a receipt shows, as it stood when the payment was recorded.
create or replace function public.receipt_data(p_receipt_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  with r as (select * from public.receipts where id = p_receipt_id),
  p as (select * from public.payments where id = (select payment_id from r)),
  mine as (select a.* from public.payment_allocations a where a.payment_id = (select id from p)),
  covered_records as (select distinct monthly_record_id from mine where monthly_record_id is not null),
  covered_extras as (select distinct extra_charge_id from mine where extra_charge_id is not null),
  parts as (
    select mp.* from public.month_parts mp
    where (mp.monthly_record_id in (select monthly_record_id from covered_records)
           or mp.extra_charge_id in (select extra_charge_id from covered_extras))
      and mp.due > 0
  ),
  earlier as (  -- received for the same months from other money before this payment (incl. advance used)
    select coalesce(sum(a.amount_paise), 0) as amt
    from public.payment_allocations a join public.payments op on op.id = a.payment_id
    where a.payment_id <> (select id from p) and not op.voided
      and a.created_at <= (select created_at from p)
      and (a.monthly_record_id in (select monthly_record_id from covered_records)
           or a.extra_charge_id in (select extra_charge_id from covered_extras))
  ),
  applied as (select coalesce(sum(amount_paise), 0) as amt from mine where not from_advance)
  select jsonb_build_object(
    'receipt', (select jsonb_build_object('id', id, 'receipt_no', receipt_no, 'issued_on', (issued_at at time zone 'Asia/Kolkata')::date,
                                          'language', language, 'voided', voided, 'void_reason', void_reason) from r),
    'payment', (select jsonb_build_object('id', p.id, 'amount', p.amount_paise, 'received_on', p.received_on, 'mode', p.mode,
                                          'reference', p.reference, 'received_by', pr.name, 'received_by_code', pr.code)
                from p left join public.partners pr on pr.id = p.received_by_partner_id),
    'client', (select jsonb_build_object('id', c.id, 'firm_name', c.firm_name, 'firm_name_hi', c.firm_name_hi, 'owner_name', c.owner_name,
                                         'preferred_language', c.preferred_language, 'phone', c.phone, 'whatsapp_phone', c.whatsapp_phone)
               from public.clients c where c.id = (select client_id from p)),
    'business', (select jsonb_build_object('name_en', business_name_en, 'name_hi', business_name_hi, 'address_en', address_en,
                                           'address_hi', address_hi, 'phones', phones, 'signature_path', signature_path)
                 from public.settings where id = 1),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('kind', case when component = 'extra' then 'extra' else component::text end,
                                                            'month', wage_month, 'paise', due,
                                                            'label', (select e.description from public.extra_charges e where e.id = parts.extra_charge_id))
                                        order by wage_month, ord) from parts), '[]'::jsonb),
    'dues', (select coalesce(sum(due), 0) from parts),
    'earlier', (select amt from earlier),
    'applied', (select amt from applied),
    'advance_kept', (select p.amount_paise from p) - (select amt from applied),
    'balance_after', greatest((select coalesce(sum(due), 0) from parts) - (select amt from earlier) - (select amt from applied), 0),
    'templates', (select jsonb_object_agg(t.language, t.body) from public.message_templates t where t.key = 'payment_received'),
    'challans', coalesce((select jsonb_agg(jsonb_build_object('month', m.wage_month, 'type', ct.challan_type, 'trrn', ct.trrn,
                                                              'number', ct.challan_number, 'paid_on', ct.paid_on))
                          from public.challan_transactions ct join public.monthly_records m on m.id = ct.monthly_record_id
                          where ct.monthly_record_id in (select monthly_record_id from covered_records) and not ct.voided), '[]'::jsonb)
  )
$$;

-- ─── Clients list ───────────────────────────────────────────────────────────
create or replace function public.clients_overview() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'firm_name', c.firm_name, 'owner_name', c.owner_name, 'phone', c.phone, 'whatsapp_phone', c.whatsapp_phone,
           'kind', c.kind, 'active', c.active, 'default_charge_paise', c.default_charge_paise,
           'challan_payer_default', c.challan_payer_default, 'partner_code', p.code, 'partner_name', p.name,
           'esic_code', c.esic_code, 'esic_code_verified', c.esic_code_verified, 'pf_code', c.pf_establishment_code,
           'owes', b.owes_paise, 'advance', b.advance_paise,
           'aliases', (select coalesce(array_agg(a.normalized_name), '{}') from public.client_aliases a where a.client_id = c.id))
         order by c.active desc, c.kind, c.firm_name), '[]'::jsonb)
  from public.clients c
  left join public.partners p on p.id = c.handled_by_partner_id
  left join public.client_balances b on b.client_id = c.id
$$;

-- ─── Writes used by the screens ─────────────────────────────────────────────
-- Fast entry: save PF and ESIC for one month (null = not entered yet).
create or replace function public.set_month_amounts(p_record_id uuid, p_pf_paise bigint, p_esic_paise bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  perform public.require_app_user();
  if (p_pf_paise is not null and p_pf_paise < 0) or (p_esic_paise is not null and p_esic_paise < 0) then
    raise exception 'Amounts can''t be negative' using errcode = 'P0001';
  end if;
  select client_id into cid from public.monthly_records where id = p_record_id;
  if not found then raise exception 'Month not found' using errcode = 'P0002'; end if;
  perform 1 from public.clients where id = cid for update;
  update public.monthly_records set pf_paise = p_pf_paise, esic_paise = p_esic_paise where id = p_record_id;
  return (select to_jsonb(s) from public.month_status s where s.monthly_record_id = p_record_id);
end $$;

-- Every WhatsApp hand-off is logged: "prepared" when the message is built, "shared" when it was handed to WhatsApp.
create or replace function public.log_message(
  p_client_id uuid, p_type text, p_language public.language_code, p_body text, p_status text,
  p_monthly_record_id uuid default null, p_payment_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  perform public.require_app_user();
  if p_status not in ('prepared', 'shared') then
    raise exception 'Manual WhatsApp messages can only be prepared or shared' using errcode = 'P0001';
  end if;
  insert into public.message_log (client_id, monthly_record_id, payment_id, type, language, channel, body, status, shared_at, sent_by)
  values (p_client_id, p_monthly_record_id, p_payment_id, p_type, p_language, 'whatsapp_manual', p_body, p_status,
          case when p_status = 'shared' then now() end, auth.uid())
  returning id into new_id;
  return new_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'board(date)', 'client_detail(uuid)', 'receipt_data(uuid)', 'clients_overview()', 'set_month_amounts(uuid, bigint, bigint)',
    'log_message(uuid, text, public.language_code, text, text, uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
