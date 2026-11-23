-- Phase 2 slice 4: walk-in work, shared expenses, partner transfers, client yearly statement.
-- Written to be safe to run twice (paste-once SQL for the live database).

-- ─── Reports treat a voided entry as if it never happened ───────────────────
-- financial_ledger keeps the original row and a reversal dated on the void day (full audit trail).
-- For reports, a mistake voided later must not distort the month it was entered in, so live_ledger
-- drops both the voided entry and its reversal (as well as settled history, as before).
create or replace view public.live_ledger with (security_invoker = true) as
select l.* from public.financial_ledger l
left join public.monthly_records m on m.id = l.monthly_record_id
left join public.extra_charges e on e.id = l.extra_charge_id
where not coalesce(m.legacy_settled, false) and not coalesce(e.legacy_settled, false)
  and not l.is_reversal
  and not exists (select 1 from public.financial_ledger r where r.entry_id = l.entry_id || ':reversal');

-- ─── Walk-in work: find or create the person, add the charge, optionally take the money now ─
create or replace function public.record_walk_in(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  name_ text := nullif(trim(p_data->>'name'), '');
  phone_ text := nullif(p_data->>'phone', '');
  norm_ text;
  client_ uuid;
  partner_ uuid;
  extra_ uuid;
  amount_ bigint := (p_data->>'amount_paise')::bigint;
  today_ date := (now() at time zone 'Asia/Kolkata')::date;
  pay_ jsonb;
begin
  perform public.require_app_user();
  if name_ is null then raise exception 'Enter the person''s or firm''s name' using errcode = 'P0001'; end if;
  if amount_ is null or amount_ <= 0 then raise exception 'Enter the amount for the work' using errcode = 'P0001'; end if;
  select id into partner_ from public.partners where code = p_data->>'partner_code';
  if partner_ is null then raise exception 'Choose who did the work' using errcode = 'P0001'; end if;
  norm_ := upper(regexp_replace(regexp_replace(name_, '[^A-Za-z0-9& ]+', ' ', 'g'), '\s+', ' ', 'g'));

  -- Same person again? Match by phone first, then by any known spelling.
  if phone_ is not null then select id into client_ from public.clients where phone = phone_ or whatsapp_phone = phone_ limit 1; end if;
  if client_ is null then select client_id into client_ from public.client_aliases where normalized_name = trim(norm_) limit 1; end if;
  if client_ is null then
    insert into public.clients (kind, firm_name, owner_name, phone, whatsapp_phone, handled_by_partner_id, preferred_language)
    values ('occasional', name_, null, phone_, phone_, partner_, coalesce(p_data->>'language', 'hi')::public.language_code)
    returning id into client_;
    insert into public.client_aliases (client_id, raw_name, normalized_name) values (client_, name_, trim(norm_)) on conflict do nothing;
  end if;

  insert into public.extra_charges (client_id, wage_month, service_type, description, amount_paise, handled_by_partner_id, done_on)
  values (client_, date_trunc('month', today_)::date, coalesce(p_data->>'service_type', 'other'), nullif(trim(p_data->>'description'), ''),
          amount_, partner_, today_)
  returning id into extra_;

  if coalesce((p_data->>'paid_now')::boolean, false) then
    pay_ := public.record_payment(
      (p_data->>'idempotency_key')::uuid, client_, amount_, today_, coalesce(p_data->>'mode', 'cash')::public.payment_mode,
      coalesce((select id from public.partners where code = p_data->>'received_by_code'), partner_),
      coalesce(p_data->>'language', 'hi')::public.language_code, nullif(trim(p_data->>'reference'), ''), null, null, false);
  end if;
  return jsonb_build_object('client_id', client_, 'extra_charge_id', extra_, 'payment', pay_);
end $$;

-- ─── Shared expenses and money passed between partners ──────────────────────
create or replace function public.add_expense(p_spent_on date, p_amount_paise bigint, p_description text, p_paid_by_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare id_ uuid; partner_ uuid;
begin
  perform public.require_app_user();
  if p_amount_paise is null or p_amount_paise <= 0 then raise exception 'Enter the amount' using errcode = 'P0001'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Say what it was for' using errcode = 'P0001'; end if;
  select id into partner_ from public.partners where code = p_paid_by_code;
  if partner_ is null then raise exception 'Choose who paid' using errcode = 'P0001'; end if;
  insert into public.expenses (spent_on, month, amount_paise, description, paid_by_partner_id)
  values (p_spent_on, date_trunc('month', p_spent_on)::date, p_amount_paise, trim(p_description), partner_)
  returning id into id_;
  return id_;
end $$;

create or replace function public.add_partner_transfer(p_from_code text, p_to_code text, p_amount_paise bigint, p_on date, p_kind text, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare id_ uuid;
begin
  perform public.require_app_user();
  if p_amount_paise is null or p_amount_paise <= 0 then raise exception 'Enter the amount' using errcode = 'P0001'; end if;
  if p_from_code = p_to_code then raise exception 'Choose two different partners' using errcode = 'P0001'; end if;
  insert into public.partner_transfers (from_partner_id, to_partner_id, amount_paise, transferred_on, month, kind, note)
  values ((select id from public.partners where code = p_from_code), (select id from public.partners where code = p_to_code),
          p_amount_paise, p_on, date_trunc('month', p_on)::date, p_kind, nullif(trim(p_note), ''))
  returning id into id_;
  return id_;
end $$;

create or replace function public.void_money_move(p_kind text, p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_app_user();
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason' using errcode = 'P0001'; end if;
  if p_kind = 'expense' then
    update public.expenses set voided = true, void_reason = p_reason where id = p_id and not voided;
  elsif p_kind = 'transfer' then
    update public.partner_transfers set voided = true, void_reason = p_reason where id = p_id and not voided;
  else
    raise exception 'Unknown entry' using errcode = 'P0001';
  end if;
  if not found then raise exception 'Not found or already void' using errcode = 'P0002'; end if;
end $$;

create or replace function public.money_moves(p_from date, p_to date) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'spent_on', e.spent_on, 'amount', e.amount_paise,
                   'description', e.description, 'paid_by', p.name, 'voided', e.voided, 'void_reason', e.void_reason) order by e.spent_on desc, e.created_at desc)
                 from public.expenses e left join public.partners p on p.id = e.paid_by_partner_id
                 where e.spent_on between p_from and p_to), '[]'::jsonb),
    'transfers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'on', t.transferred_on, 'amount', t.amount_paise, 'kind', t.kind,
                   'from', pf.name, 'to', pt.name, 'note', t.note, 'voided', t.voided, 'void_reason', t.void_reason) order by t.transferred_on desc, t.created_at desc)
                 from public.partner_transfers t join public.partners pf on pf.id = t.from_partner_id join public.partners pt on pt.id = t.to_partner_id
                 where t.transferred_on between p_from and p_to), '[]'::jsonb)
  )
$$;

-- ─── Client statement for a period (usually a financial year) ───────────────
create or replace function public.client_statement(p_client_id uuid, p_from date, p_to date) returns jsonb
language sql stable set search_path = '' as $$
  with parts as (select * from public.client_outstanding(p_client_id))
  select jsonb_build_object(
    'client', (select jsonb_build_object('id', c.id, 'firm_name', c.firm_name, 'firm_name_hi', c.firm_name_hi, 'owner_name', c.owner_name,
                                         'pf_code', c.pf_establishment_code, 'esic_code', c.esic_code, 'preferred_language', c.preferred_language,
                                         'phone', c.phone, 'whatsapp_phone', c.whatsapp_phone)
               from public.clients c where c.id = p_client_id),
    'business', (select jsonb_build_object('name_en', business_name_en, 'name_hi', business_name_hi, 'address_en', address_en,
                                           'address_hi', address_hi, 'phones', phones) from public.settings where id = 1),
    'from', p_from, 'to', p_to,
    -- Owed for months before the period (as things stand today)
    'opening', (select coalesce(sum(outstanding), 0) from parts where wage_month < p_from),
    'months', coalesce((select jsonb_agg(jsonb_build_object(
                  'wage_month', s.wage_month, 'challan_payer', s.challan_payer, 'pf', m.pf_paise, 'esic', m.esic_paise, 'charge', m.charge_paise,
                  'extras', (select coalesce(sum(e.amount_paise), 0) from public.extra_charges e where e.client_id = p_client_id and e.wage_month = s.wage_month and not e.voided),
                  'due', s.due_to_us, 'received', s.received, 'owes', s.owes,
                  'pf_trrn', (select coalesce(c.trrn, c.challan_number) from public.challan_transactions c where c.monthly_record_id = s.monthly_record_id and c.challan_type = 'pf' and not c.voided),
                  'esic_no', (select coalesce(c.challan_number, c.trrn) from public.challan_transactions c where c.monthly_record_id = s.monthly_record_id and c.challan_type = 'esic' and not c.voided))
                order by s.wage_month)
               from public.month_status s join public.monthly_records m on m.id = s.monthly_record_id
               where s.client_id = p_client_id and s.wage_month between p_from and p_to and not s.legacy_settled), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('received_on', p.received_on, 'amount', p.amount_paise, 'mode', p.mode,
                    'receipt_no', (select r.receipt_no from public.receipts r where r.payment_id = p.id and not r.voided order by r.issued_at desc limit 1))
                  order by p.received_on)
                 from public.payments p where p.client_id = p_client_id and not p.voided and p.received_on between p_from and p_to), '[]'::jsonb),
    'closing', (select coalesce(sum(outstanding), 0) from parts where wage_month <= p_to),
    'advance', (select advance_paise from public.client_balances where client_id = p_client_id)
  )
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'record_walk_in(jsonb)', 'add_expense(date, bigint, text, text)', 'add_partner_transfer(text, text, bigint, date, text, text)',
    'void_money_move(text, uuid, text)', 'money_moves(date, date)', 'client_statement(uuid, date, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
