-- Phase 2 slice 3: settings, reconciliation, partner settlement, receipt register, month export.
-- Reports are computed from the financial_ledger VIEW and the source tables: never stored,
-- never adjusted to make numbers match. Mismatches are listed, not hidden.

-- ─── Settings ───────────────────────────────────────────────────────────────
create or replace function public.settings_get() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) - 'logo_path' - 'signature_path' from public.settings s where id = 1),
    'templates', (select jsonb_object_agg(k.key, k.langs) from (
                    select key, jsonb_object_agg(language, body) as langs from public.message_templates group by key) k),
    'partners', (select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'full_name', full_name) order by code) from public.partners where active),
    'split', (select jsonb_build_object('effective_from', max(effective_from),
                'rules', (select jsonb_object_agg(p.code, r.percent) from public.split_rules r join public.partners p on p.id = r.partner_id
                          where r.effective_from = (select max(effective_from) from public.split_rules where effective_from <= (now() at time zone 'Asia/Kolkata')::date)))
              from public.split_rules where effective_from <= (now() at time zone 'Asia/Kolkata')::date)
  )
$$;

create or replace function public.save_settings(p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_app_user();
  if coalesce(trim(p_data->>'business_name_en'), '') = '' then raise exception 'Business name is needed' using errcode = 'P0001'; end if;
  update public.settings set
    business_name_en = trim(p_data->>'business_name_en'),
    business_name_hi = coalesce(trim(p_data->>'business_name_hi'), ''),
    address_en = coalesce(trim(p_data->>'address_en'), ''),
    address_hi = coalesce(trim(p_data->>'address_hi'), ''),
    phones = coalesce((select array_agg(x) from jsonb_array_elements_text(p_data->'phones') x where x ~ '^\+91[6-9][0-9]{9}$'), '{}'),
    due_day = (p_data->>'due_day')::int,
    reminder_days = coalesce((select array_agg(x::int order by x::int desc) from jsonb_array_elements_text(p_data->'reminder_days') x), '{5,2}')
  where id = 1;
end $$;

create or replace function public.save_template(p_key text, p_language public.language_code, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_app_user();
  if coalesce(trim(p_body), '') = '' then raise exception 'A message can''t be empty' using errcode = 'P0001'; end if;
  insert into public.message_templates (key, language, body) values (p_key, p_language, p_body)
  on conflict (key, language) do update set body = excluded.body;
end $$;

-- New split from a date onwards (past months keep the old split). Percentages must add up to 100.
create or replace function public.set_split(p_effective_from date, p_alok numeric, p_rajeev numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_app_user();
  if p_alok < 0 or p_rajeev < 0 or p_alok + p_rajeev <> 100 then
    raise exception 'The split must add up to 100%%' using errcode = 'P0001';
  end if;
  insert into public.split_rules (effective_from, partner_id, percent)
  select p_effective_from, id, case code when 'A' then p_alok else p_rajeev end from public.partners where code in ('A', 'R')
  on conflict (effective_from, partner_id) do update set percent = excluded.percent;
end $$;

-- ─── Ledger without settled history ────────────────────────────────────────
-- Months marked legacy_settled (history brought over as "already paid") have no recorded payments,
-- so their challans would look like government money paid from a partner's pocket. Reports use this.
create or replace view public.live_ledger with (security_invoker = true) as
select l.* from public.financial_ledger l
left join public.monthly_records m on m.id = l.monthly_record_id
left join public.extra_charges e on e.id = l.extra_charge_id
where not coalesce(m.legacy_settled, false) and not coalesce(e.legacy_settled, false);
revoke all on public.live_ledger from anon;
grant select on public.live_ledger to authenticated;

-- ─── Reconciliation ─────────────────────────────────────────────────────────
-- Money flows (received, deposited, expenses, transfers) are taken by date in [p_from, p_to];
-- dues are taken by wage month in [p_from, p_to].
create or replace function public.reconciliation(p_from date, p_to date) returns jsonb
language sql stable set search_path = '' as $$
  with l as (select * from public.live_ledger where entry_date between p_from and p_to),
  money as (select * from l where payment_id is not null),
  partner_rows as (
    select p.id, p.code, p.name,
      coalesce((select sum(signed_paise) from money where partner_id = p.id), 0) as received,
      coalesce((select sum(signed_paise) from money where partner_id = p.id and part in ('pf', 'esic')), 0) as gov_collected,
      coalesce((select -sum(signed_paise) from l where partner_id = p.id and event in ('pf_deposited', 'esic_deposited')), 0) as gov_deposited,
      coalesce((select sum(signed_paise) from l where partner_id = p.id and event like 'transfer_%' and part = 'gov_handover'), 0) as gov_handover,
      coalesce((select sum(signed_paise) from money where partner_id = p.id and part in ('charge', 'extra')), 0) as fees,
      coalesce((select sum(signed_paise) from money where partner_id = p.id and part = 'advance'), 0) as advance
    from public.partners p where p.active
  ),
  modes as (
    select mode, sum(signed_paise) as received, count(distinct payment_id) filter (where not is_reversal) as payments
    from money group by mode
  ),
  months as (
    select s.wage_month,
      sum(s.due_to_us) as due_to_us, sum(s.received) as received, sum(s.owes) as owes,
      sum(case when s.challan_payer = 'us' then coalesce(m.pf_paise, 0) else 0 end) as pf_due,
      sum(case when s.challan_payer = 'us' then coalesce(m.esic_paise, 0) else 0 end) as esic_due,
      count(*) as clients, count(*) filter (where s.overall_status = 'DONE') as done
    from public.month_status s join public.monthly_records m on m.id = s.monthly_record_id
    where s.wage_month between date_trunc('month', p_from)::date and p_to and not s.legacy_settled
    group by s.wage_month
  ),
  gov as (  -- per wage month and type: collected from clients vs deposited by us
    select m.wage_month, t.typ,
      sum(case when m.challan_payer = 'us' then coalesce(case t.typ when 'pf' then m.pf_paise else m.esic_paise end, 0) else 0 end) as due,
      coalesce((select sum(a.amount_paise) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                join public.monthly_records mm on mm.id = a.monthly_record_id
                where not p.voided and a.component::text = t.typ and mm.wage_month = m.wage_month), 0) as collected,
      coalesce((select sum(c.amount_paise) from public.challan_transactions c join public.monthly_records mm on mm.id = c.monthly_record_id
                where not c.voided and c.paid_by = 'us' and c.challan_type = t.typ and mm.wage_month = m.wage_month), 0) as deposited
    from public.monthly_records m cross join (values ('pf'), ('esic')) t(typ)
    where m.wage_month between date_trunc('month', p_from)::date and p_to and not m.legacy_settled
    group by m.wage_month, t.typ
  ),
  clients_ as (
    select c.id, c.firm_name, b.owes_paise as owes, b.advance_paise as advance,
      coalesce((select sum(signed_paise) from money where client_id = c.id), 0) as received,
      coalesce((select sum(s.due_to_us) from public.month_status s where s.client_id = c.id
                and s.wage_month between date_trunc('month', p_from)::date and p_to and not s.legacy_settled), 0) as due
    from public.clients c join public.client_balances b on b.client_id = c.id
  ),
  mismatches as (
    -- a challan whose amount differs from the PF/ESIC entered for that month
    select 'challan_amount' as kind, cl.firm_name as client, c.monthly_record_id as ref, m.wage_month,
           format('%s challan %s is ₹%s but %s entered for the month is ₹%s', upper(c.challan_type), coalesce(c.trrn, c.challan_number),
                  to_char(c.amount_paise / 100.0, 'FM99,99,99,990.00'), upper(c.challan_type),
                  to_char(coalesce(case c.challan_type when 'pf' then m.pf_paise else m.esic_paise end, 0) / 100.0, 'FM99,99,99,990.00')) as message
    from public.challan_transactions c join public.monthly_records m on m.id = c.monthly_record_id join public.clients cl on cl.id = m.client_id
    where not c.voided and c.amount_paise <> coalesce(case c.challan_type when 'pf' then m.pf_paise else m.esic_paise end, 0)
      and m.wage_month between date_trunc('month', p_from)::date and p_to
    union all
    -- a payment without exactly one valid receipt
    select 'receipt_count', cl.firm_name, p.id, null,
           format('Payment of ₹%s on %s has %s valid receipts (should be 1)', to_char(p.amount_paise / 100.0, 'FM99,99,99,990.00'),
                  to_char(p.received_on, 'DD/MM/YYYY'), (select count(*) from public.receipts r where r.payment_id = p.id and not r.voided))
    from public.payments p join public.clients cl on cl.id = p.client_id
    where not p.voided and p.received_on between p_from and p_to
      and (select count(*) from public.receipts r where r.payment_id = p.id and not r.voided) <> 1
    union all
    -- a gap in receipt numbers within a financial year
    select 'receipt_gap', null, null, null,
           format('Receipt numbers for %s run to %s but only %s exist', financial_year, max(seq), count(*))
    from public.receipts group by financial_year having max(seq) <> count(*)
    union all
    -- a partner deposited more government money than they collected
    select 'gov_negative', name, id, null,
           format('%s deposited ₹%s more than collected in this period (paid from own pocket, or a payment is missing)', name,
                  to_char(-(gov_collected - gov_deposited + gov_handover) / 100.0, 'FM99,99,99,990.00'))
    from partner_rows where gov_collected - gov_deposited + gov_handover < 0
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', jsonb_build_object(
      'received', (select coalesce(sum(signed_paise), 0) from money),
      'gov_collected', (select coalesce(sum(signed_paise), 0) from money where part in ('pf', 'esic')),
      'gov_deposited', (select coalesce(-sum(signed_paise), 0) from l where event in ('pf_deposited', 'esic_deposited')),
      'fees', (select coalesce(sum(signed_paise), 0) from money where part in ('charge', 'extra')),
      'advance', (select coalesce(sum(signed_paise), 0) from money where part = 'advance'),
      'owes_now', (select coalesce(sum(owes_paise), 0) from public.client_balances),
      'advance_now', (select coalesce(sum(advance_paise), 0) from public.client_balances)
    ),
    'partners', coalesce((select jsonb_agg(to_jsonb(x) order by code) from partner_rows x), '[]'::jsonb),
    'modes', coalesce((select jsonb_agg(to_jsonb(x) order by mode) from modes x), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(to_jsonb(x) order by wage_month desc) from months x), '[]'::jsonb),
    'gov', coalesce((select jsonb_agg(to_jsonb(x) order by wage_month desc, typ) from gov x), '[]'::jsonb),
    'clients', coalesce((select jsonb_agg(to_jsonb(x) order by owes desc, firm_name) from clients_ x where due > 0 or received <> 0 or owes > 0 or advance > 0), '[]'::jsonb),
    'mismatches', coalesce((select jsonb_agg(to_jsonb(x)) from mismatches x), '[]'::jsonb)
  )
$$;

-- ─── Partner settlement (figures; the split arithmetic is done in the app and unit-tested) ─
create or replace function public.settlement(p_from date, p_to date) returns jsonb
language sql stable set search_path = '' as $$
  with l as (select * from public.live_ledger where entry_date between p_from and p_to),
  rule_date as (select max(effective_from) d from public.split_rules where effective_from <= p_to)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'partners', (select jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'name', p.name,
        'fees_received', coalesce((select sum(signed_paise) from l where partner_id = p.id and payment_id is not null and part in ('charge', 'extra')), 0),
        'expenses_paid', coalesce((select -sum(signed_paise) from l where partner_id = p.id and event = 'expense'), 0),
        'transfers_net', coalesce((select sum(signed_paise) from l where partner_id = p.id and event like 'transfer_%' and part = 'settlement'), 0),
        'earned_as_handler', coalesce((
          select sum(a.amount_paise) from public.payment_allocations a join public.payments pay on pay.id = a.payment_id
          left join public.monthly_records m on m.id = a.monthly_record_id left join public.extra_charges e on e.id = a.extra_charge_id
          where not pay.voided and a.component in ('charge', 'extra') and pay.received_on between p_from and p_to
            and coalesce(m.handled_by_partner_id, e.handled_by_partner_id) = p.id), 0),
        'share_percent', coalesce((select r.percent from public.split_rules r where r.partner_id = p.id and r.effective_from = (select d from rule_date)), 0),
        'gov_held', coalesce((select sum(signed_paise) from public.live_ledger g
                              where g.partner_id = p.id and g.entry_date <= p_to
                                and (g.part in ('pf', 'esic') or (g.event like 'transfer_%' and g.part = 'gov_handover'))), 0)
      ) order by p.code) from public.partners p where p.active),
    'fees_no_handler', coalesce((
          select sum(a.amount_paise) from public.payment_allocations a join public.payments pay on pay.id = a.payment_id
          left join public.monthly_records m on m.id = a.monthly_record_id left join public.extra_charges e on e.id = a.extra_charge_id
          where not pay.voided and a.component in ('charge', 'extra') and pay.received_on between p_from and p_to
            and coalesce(m.handled_by_partner_id, e.handled_by_partner_id) is null), 0),
    'expenses_unassigned', coalesce((select -sum(signed_paise) from l where partner_id is null and event = 'expense'), 0),
    'split_from', (select d from rule_date)
  )
$$;

-- ─── Receipt register (valid and void) ──────────────────────────────────────
create or replace function public.receipt_register(p_from date, p_to date) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'receipt_no', r.receipt_no, 'financial_year', r.financial_year, 'seq', r.seq,
      'issued_on', (r.issued_at at time zone 'Asia/Kolkata')::date, 'client_id', c.id, 'firm_name', c.firm_name,
      'amount', p.amount_paise, 'mode', p.mode, 'received_by', pr.name, 'received_on', p.received_on,
      'language', r.language, 'voided', r.voided, 'void_reason', r.void_reason,
      'replaces', (select rr.receipt_no from public.receipts rr where rr.id = r.replaces_receipt_id))
    order by r.financial_year desc, r.seq desc), '[]'::jsonb)
  from public.receipts r
  join public.payments p on p.id = r.payment_id
  join public.clients c on c.id = r.client_id
  left join public.partners pr on pr.id = p.received_by_partner_id
  where (r.issued_at at time zone 'Asia/Kolkata')::date between p_from and p_to
$$;

-- One-off charges of a month (for the Excel export's lines below TOTAL).
create or replace function public.month_extras(p_month date) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('firm_name', c.firm_name, 'description', e.description, 'service_type', e.service_type,
                                               'amount', e.amount_paise, 'partner_code', p.code, 'done_on', e.done_on)
                            order by e.created_at), '[]'::jsonb)
  from public.extra_charges e join public.clients c on c.id = e.client_id left join public.partners p on p.id = e.handled_by_partner_id
  where e.wage_month = p_month and not e.voided
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'settings_get()', 'save_settings(jsonb)', 'save_template(text, public.language_code, text)', 'set_split(date, numeric, numeric)',
    'reconciliation(date, date)', 'settlement(date, date)', 'receipt_register(date, date)', 'month_extras(date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
