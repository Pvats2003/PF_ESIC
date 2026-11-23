-- Speed: live_ledger left out cancelled entries with "not exists (… a reversal row …)" over the
-- financial_ledger VIEW, which re-built the whole ledger once per row (Reports took ~8 s).
-- Same rows, found by looking at each entry's own source row instead. Safe to run twice.
create or replace view public.live_ledger with (security_invoker = true) as
select l.* from public.financial_ledger l
left join public.monthly_records m on m.id = l.monthly_record_id
left join public.extra_charges e on e.id = l.extra_charge_id
left join public.payments p on p.id = l.payment_id
left join public.challan_transactions c on c.id = l.challan_transaction_id
left join public.expenses x on l.entry_id like 'expense:%' and x.id::text = split_part(l.entry_id, ':', 2)
left join public.partner_transfers t on l.entry_id like 'xfer-%' and t.id::text = split_part(l.entry_id, ':', 2)
where not l.is_reversal
  and not coalesce(m.legacy_settled, false) and not coalesce(e.legacy_settled, false)
  and not coalesce(p.voided, false) and not coalesce(c.voided, false)
  and not coalesce(x.voided, false) and not coalesce(t.voided, false);

-- Reconciliation: same result, per-client totals computed once instead of once per client.
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
  -- Totals per client in one pass each (a per-client lookup into month_status took seconds).
  due_by_client as (
    select s.client_id, sum(s.due_to_us) as due from public.month_status s
    where s.wage_month between date_trunc('month', p_from)::date and p_to and not s.legacy_settled
    group by s.client_id
  ),
  received_by_client as (select client_id, sum(signed_paise) as received from money group by client_id),
  balances as materialized (select * from public.client_balances),
  clients_ as (
    select c.id, c.firm_name, b.owes_paise as owes, b.advance_paise as advance,
      coalesce(r.received, 0) as received, coalesce(d.due, 0) as due
    from public.clients c join balances b on b.client_id = c.id
    left join received_by_client r on r.client_id = c.id
    left join due_by_client d on d.client_id = c.id
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
      'owes_now', (select coalesce(sum(owes_paise), 0) from balances),
      'advance_now', (select coalesce(sum(advance_paise), 0) from balances)
    ),
    'partners', coalesce((select jsonb_agg(to_jsonb(x) order by code) from partner_rows x), '[]'::jsonb),
    'modes', coalesce((select jsonb_agg(to_jsonb(x) order by mode) from modes x), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(to_jsonb(x) order by wage_month desc) from months x), '[]'::jsonb),
    'gov', coalesce((select jsonb_agg(to_jsonb(x) order by wage_month desc, typ) from gov x), '[]'::jsonb),
    'clients', coalesce((select jsonb_agg(to_jsonb(x) order by owes desc, firm_name) from clients_ x where due > 0 or received <> 0 or owes > 0 or advance > 0), '[]'::jsonb),
    'mismatches', coalesce((select jsonb_agg(to_jsonb(x)) from mismatches x), '[]'::jsonb)
  )
$$;
