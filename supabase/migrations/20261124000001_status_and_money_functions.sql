-- Phase 2 database layer: month statuses, client balances, and the trusted
-- functions that move money (record payment, use advance, void, reissue,
-- challans, start month). Every function: allow-listed users only, one
-- transaction, client row locked, Zod-validated by the server action first.
--
-- Owner rule changes (approved after the Section 11 doc):
--   1. Challan done: payer "us" → a TRRN / challan number is enough (evidence optional);
--      payer "client" → evidence + partner confirmation required (Proof pending until then).
--   2. When the amount due to us for a month is ₹0, payment and receipt are NOT_REQUIRED.

-- ─── Track when a month's amounts change (receipts issued before that need reissuing) ─
alter table public.monthly_records add column amounts_changed_at timestamptz;

create or replace function public.guard_monthly_amounts() returns trigger
language plpgsql as $$
declare
  part text;
  applied bigint;
  new_due bigint;
begin
  if (new.pf_paise, new.esic_paise, new.charge_paise, new.challan_payer) is not distinct from
     (old.pf_paise, old.esic_paise, old.charge_paise, old.challan_payer) then
    return new;
  end if;
  -- Never lower an amount below what has already been received for it: void the payment first.
  foreach part in array array['pf', 'esic', 'charge'] loop
    select coalesce(sum(a.amount_paise), 0) into applied
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    where a.monthly_record_id = new.id and a.component::text = part and not p.voided;
    new_due := case part
      when 'pf' then case when new.challan_payer = 'us' then coalesce(new.pf_paise, 0) else 0 end
      when 'esic' then case when new.challan_payer = 'us' then coalesce(new.esic_paise, 0) else 0 end
      else new.charge_paise end;
    if applied > new_due then
      raise exception 'Already received ₹% for % this month, more than the new amount. Void that payment first, then record it again.',
        applied / 100, upper(part) using errcode = 'P0001';
    end if;
  end loop;
  new.amounts_changed_at := now();
  return new;
end $$;
create trigger monthly_records_amounts_guard before update on public.monthly_records
  for each row execute function public.guard_monthly_amounts();

-- ─── What each month owes, part by part ────────────────────────────────────
create view public.month_parts with (security_invoker = true) as
select m.id as monthly_record_id, null::uuid as extra_charge_id, m.client_id, m.wage_month, p.component, p.ord, p.due
from public.monthly_records m
cross join lateral (values
  ('pf'::public.allocation_part, 1, case when m.challan_payer = 'us' then coalesce(m.pf_paise, 0) else 0 end),
  ('esic'::public.allocation_part, 2, case when m.challan_payer = 'us' then coalesce(m.esic_paise, 0) else 0 end),
  ('charge'::public.allocation_part, 3, m.charge_paise)
) as p(component, ord, due)
where not m.legacy_settled
union all
select null, e.id, e.client_id, e.wage_month, 'extra'::public.allocation_part, 4, e.amount_paise
from public.extra_charges e
where not e.voided and not e.legacy_settled;

-- Outstanding per part, oldest month first; PF → ESIC → charge → extras within a month.
create or replace function public.client_outstanding(p_client_id uuid)
returns table (monthly_record_id uuid, extra_charge_id uuid, wage_month date, component public.allocation_part, ord int,
               due bigint, received bigint, outstanding bigint)
language sql stable set search_path = '' as $$
  select mp.monthly_record_id, mp.extra_charge_id, mp.wage_month, mp.component, mp.ord, mp.due,
         coalesce(r.received, 0), greatest(mp.due - coalesce(r.received, 0), 0)
  from public.month_parts mp
  left join lateral (
    select sum(a.amount_paise) as received
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    where not p.voided and a.component = mp.component
      and a.monthly_record_id is not distinct from mp.monthly_record_id
      and a.extra_charge_id is not distinct from mp.extra_charge_id
  ) r on true
  where mp.client_id = p_client_id
  order by mp.wage_month, mp.ord, mp.extra_charge_id
$$;

-- Unapplied money per payment (the client's advance), oldest first.
create or replace function public.client_advances(p_client_id uuid)
returns table (payment_id uuid, received_on date, unapplied bigint)
language sql stable set search_path = '' as $$
  select p.id, p.received_on, p.amount_paise - coalesce(sum(a.amount_paise), 0)
  from public.payments p
  left join public.payment_allocations a on a.payment_id = p.id
  where p.client_id = p_client_id and not p.voided
  group by p.id
  having p.amount_paise - coalesce(sum(a.amount_paise), 0) > 0
  order by p.received_on, p.created_at
$$;

create view public.client_balances with (security_invoker = true) as
select c.id as client_id,
       coalesce((select sum(o.outstanding) from public.client_outstanding(c.id) o), 0)::bigint as owes_paise,
       coalesce((select sum(v.unapplied) from public.client_advances(c.id) v), 0)::bigint as advance_paise
from public.clients c;

-- ─── Month status: independent dimensions + one overall chip ───────────────
create view public.month_status with (security_invoker = true) as
with base as (
  select m.*,
         (m.pf_paise is not null and m.esic_paise is not null) as amounts_entered,
         (select coalesce(sum(o.due), 0) from public.month_parts o
            where o.monthly_record_id = m.id
               or o.extra_charge_id in (select e.id from public.extra_charges e
                                        where e.client_id = m.client_id and e.wage_month = m.wage_month and not e.voided)) as due_to_us,
         (select coalesce(sum(a.amount_paise), 0) from public.payment_allocations a join public.payments p on p.id = a.payment_id
            where not p.voided and (a.monthly_record_id = m.id
               or a.extra_charge_id in (select e.id from public.extra_charges e
                                        where e.client_id = m.client_id and e.wage_month = m.wage_month and not e.voided))) as received
  from public.monthly_records m
),
challans as (
  select b.id,
         t.challan_type,
         t.amount,
         c.id as challan_id, c.paid_by, c.trrn, c.challan_number, c.evidence_file_path, c.verified_at
  from base b
  cross join lateral (values ('pf', b.pf_paise), ('esic', b.esic_paise)) as t(challan_type, amount)
  left join public.challan_transactions c on c.monthly_record_id = b.id and c.challan_type = t.challan_type and not c.voided
),
challan_dim as (
  select id, challan_type,
         case
           when amount = 0 then 'NOT_REQUIRED'
           when challan_id is null then 'PENDING'
           when verified_at is not null then 'VERIFIED'
           else 'PAID'
         end as status,
         -- Rule 1: our challans are done once a TRRN / challan number is entered; client challans need verified proof.
         case
           when amount = 0 then true
           when challan_id is null then false
           when paid_by = 'us' then coalesce(trrn, challan_number) is not null
           else verified_at is not null
         end as done,
         (challan_id is not null and paid_by = 'client' and verified_at is null) as proof_pending
  from challans
),
receipts as (
  select b.id,
         bool_or(not r.voided) filter (where r.id is not null) as has_valid,
         bool_or(r.voided) filter (where r.id is not null) as has_void,
         bool_or(not r.voided and exists (
           select 1 from public.message_log ml where ml.payment_id = r.payment_id and ml.type = 'receipt'
             and ml.status in ('shared', 'delivered', 'read'))) as shared,
         bool_or(not r.voided and r.issued_at < b.amounts_changed_at) as needs_reissue
  from base b
  left join public.payment_allocations a on a.monthly_record_id = b.id
  left join public.payments p on p.id = a.payment_id
  left join public.receipts r on r.payment_id = p.id
  group by b.id
),
dims as (
  select b.id as monthly_record_id, b.client_id, b.wage_month, b.due_date, b.challan_payer, b.legacy_settled,
         b.handled_by_partner_id, b.due_to_us, b.received, greatest(b.due_to_us - b.received, 0) as owes,
         case when b.amounts_entered then 'ENTERED' else 'AMOUNTS_PENDING' end as amount_status,
         case when exists (select 1 from public.message_log ml where ml.monthly_record_id = b.id
                             and ml.type in ('dues_we_pay', 'challan_ready_client_pays')
                             and ml.status in ('shared', 'delivered', 'read'))
              then 'NOTIFIED' else 'NOT_NOTIFIED' end as notification_status,
         case
           when b.legacy_settled then 'PAID'
           -- Rule 2: nothing due to us → no payment needed (but only once we know the amounts, if we pay the challan)
           when b.due_to_us = 0 and (b.amounts_entered or b.challan_payer = 'client') then 'NOT_REQUIRED'
           when b.received = 0 then 'UNPAID'
           when b.received < b.due_to_us then 'PART_PAID'
           else 'PAID'
         end as payment_status,
         (select string_agg(d.status, ',' order by d.challan_type) from challan_dim d where d.id = b.id) as challan_statuses,
         (select bool_and(d.done) from challan_dim d where d.id = b.id) as challans_done,
         (select bool_or(d.proof_pending) from challan_dim d where d.id = b.id) as proof_pending,
         (select bool_or(d.status = 'PENDING') from challan_dim d where d.id = b.id) as challan_pending,
         r.has_valid, r.has_void, coalesce(r.shared, false) as receipt_shared, coalesce(r.needs_reissue, false) as receipt_needs_reissue,
         b.amounts_entered
  from base b
  join receipts r on r.id = b.id
)
select d.monthly_record_id, d.client_id, d.wage_month, d.due_date, d.challan_payer, d.legacy_settled, d.handled_by_partner_id,
       d.due_to_us, d.received, d.owes,
       d.amount_status, d.notification_status, d.payment_status,
       split_part(d.challan_statuses, ',', 1) as esic_challan_status,
       split_part(d.challan_statuses, ',', 2) as pf_challan_status,
       case
         when d.legacy_settled then 'NOT_REQUIRED'
         when d.payment_status = 'NOT_REQUIRED' then 'NOT_REQUIRED'
         when d.has_valid then 'ISSUED'
         when d.has_void then 'VOIDED'
         else 'NOT_ISSUED'
       end as receipt_status,
       d.receipt_shared, d.receipt_needs_reissue,
       (not d.legacy_settled
        and (now() at time zone 'Asia/Kolkata')::date > d.due_date
        and (d.payment_status in ('UNPAID', 'PART_PAID') or not d.challans_done or not d.amounts_entered)) as overdue,
       case
         when d.legacy_settled then 'DONE'
         when not d.amounts_entered then 'AMOUNTS_PENDING'
         when (now() at time zone 'Asia/Kolkata')::date > d.due_date
              and (d.payment_status in ('UNPAID', 'PART_PAID') or not d.challans_done) then 'OVERDUE'
         when d.notification_status = 'NOT_NOTIFIED' and (d.payment_status = 'UNPAID' or (d.payment_status = 'NOT_REQUIRED' and not d.challans_done)) then 'NOT_NOTIFIED'
         when d.payment_status = 'PART_PAID' then 'PART_PAID'
         when d.payment_status = 'UNPAID' then 'PAYMENT_PENDING'
         when d.challan_pending then 'CHALLAN_PENDING'
         when d.proof_pending then 'PROOF_PENDING'
         when d.receipt_needs_reissue then 'RECEIPT_TO_REISSUE'
         when d.payment_status in ('PAID') and not d.receipt_shared then 'RECEIPT_TO_SHARE'
         else 'DONE'
       end as overall_status
from dims d;

-- ─── Helpers for the functions below ────────────────────────────────────────
create or replace function public.require_app_user() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_user() then raise exception 'Not allowed' using errcode = '42501'; end if;
end $$;

-- Apply `p_amount` from `p_payment_id` to the client's outstanding parts.
-- p_months limits which months (null = all, oldest first). Returns the amount applied.
create or replace function public.apply_to_outstanding(
  p_payment_id uuid, p_client_id uuid, p_amount bigint, p_months uuid[], p_from_advance boolean
) returns bigint
language plpgsql set search_path = '' as $$
declare
  left_ bigint := p_amount;
  part record;
  take bigint;
begin
  for part in
    select o.* from public.client_outstanding(p_client_id) o
    where o.outstanding > 0
      and (p_months is null
           or o.monthly_record_id = any(p_months)
           or o.extra_charge_id in (select e.id from public.extra_charges e join public.monthly_records m
                                      on m.client_id = e.client_id and m.wage_month = e.wage_month
                                    where m.id = any(p_months)))
  loop
    exit when left_ <= 0;
    take := least(left_, part.outstanding);
    insert into public.payment_allocations (payment_id, monthly_record_id, extra_charge_id, component, amount_paise, from_advance)
    values (p_payment_id, part.monthly_record_id, part.extra_charge_id, part.component, take, p_from_advance);
    left_ := left_ - take;
  end loop;
  return p_amount - left_;
end $$;

-- ─── Record payment (+ optional "Use ₹X advance?") + receipt, atomically ────
create or replace function public.record_payment(
  p_idempotency_key uuid,
  p_client_id uuid,
  p_amount_paise bigint,
  p_received_on date,
  p_mode public.payment_mode,
  p_received_by uuid,
  p_language public.language_code,
  p_reference text default null,
  p_notes text default null,
  p_months uuid[] default null,
  p_use_advance boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing record;
  pay_id uuid;
  adv record;
  adv_used bigint := 0;
  applied bigint;
  num record;
  rec_id uuid;
begin
  perform public.require_app_user();

  -- A double tap (or a retry after a dropped connection) returns the first result.
  select p.id, r.id as receipt_id, r.receipt_no into existing
  from public.payments p left join public.receipts r on r.payment_id = p.id and not r.voided
  where p.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('payment_id', existing.id, 'receipt_id', existing.receipt_id,
                              'receipt_no', existing.receipt_no, 'duplicate', true);
  end if;

  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Amount must be more than ₹0' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.partners where id = p_received_by and active) then
    raise exception 'Choose who received the money' using errcode = 'P0001';
  end if;

  -- Serialise everything for this client: two partners can't double-apply the same dues.
  perform 1 from public.clients where id = p_client_id for update;
  if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;

  -- The partner chose "Use ₹X advance?": apply existing advances first, oldest first.
  if p_use_advance then
    for adv in select * from public.client_advances(p_client_id) loop
      adv_used := adv_used + public.apply_to_outstanding(adv.payment_id, p_client_id, adv.unapplied, p_months, true);
    end loop;
  end if;

  insert into public.payments (client_id, amount_paise, received_on, mode, received_by_partner_id, reference, notes, idempotency_key)
  values (p_client_id, p_amount_paise, p_received_on, p_mode, p_received_by, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), p_idempotency_key)
  returning id into pay_id;

  applied := public.apply_to_outstanding(pay_id, p_client_id, p_amount_paise, p_months, false);

  select * into num from public.take_receipt_number(p_received_on);
  insert into public.receipts (receipt_no, financial_year, seq, payment_id, client_id, language)
  values (num.out_receipt_no, num.out_financial_year, num.out_seq, pay_id, p_client_id, p_language)
  returning id into rec_id;

  return jsonb_build_object(
    'payment_id', pay_id, 'receipt_id', rec_id, 'receipt_no', num.out_receipt_no,
    'applied_paise', applied, 'advance_added_paise', p_amount_paise - applied,
    'advance_used_paise', adv_used, 'duplicate', false);
end $$;

-- "Use advance" on its own (no new money): no receipt, since nothing was received.
create or replace function public.use_advance(p_client_id uuid, p_months uuid[] default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare adv record; used bigint := 0;
begin
  perform public.require_app_user();
  perform 1 from public.clients where id = p_client_id for update;
  for adv in select * from public.client_advances(p_client_id) loop
    used := used + public.apply_to_outstanding(adv.payment_id, p_client_id, adv.unapplied, p_months, true);
  end loop;
  return used;
end $$;

-- Void a payment and its receipt together. The money goes back to "owes".
create or replace function public.void_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  perform public.require_app_user();
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for voiding' using errcode = 'P0001'; end if;
  select client_id into cid from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  perform 1 from public.clients where id = cid for update;
  update public.receipts set voided = true, void_reason = p_reason where payment_id = p_payment_id and not voided;
  update public.payments set voided = true, void_reason = p_reason, voided_by = auth.uid() where id = p_payment_id and not voided;
end $$;

-- Void a receipt and issue its replacement (new number) in one step.
create or replace function public.reissue_receipt(p_receipt_id uuid, p_reason text, p_language public.language_code) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare old public.receipts; num record; new_id uuid; pay public.payments;
begin
  perform public.require_app_user();
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for reissuing' using errcode = 'P0001'; end if;
  select * into old from public.receipts where id = p_receipt_id for update;
  if not found then raise exception 'Receipt not found' using errcode = 'P0002'; end if;
  if old.voided then raise exception 'This receipt is already void' using errcode = 'P0001'; end if;
  select * into pay from public.payments where id = old.payment_id;
  if pay.voided then raise exception 'The payment is void; record it again instead' using errcode = 'P0001'; end if;
  update public.receipts set voided = true, void_reason = p_reason where id = old.id;
  -- Numbered by today's date in India (a new document), not the original payment date.
  select * into num from public.take_receipt_number((now() at time zone 'Asia/Kolkata')::date);
  insert into public.receipts (receipt_no, financial_year, seq, payment_id, client_id, language, replaces_receipt_id)
  values (num.out_receipt_no, num.out_financial_year, num.out_seq, old.payment_id, old.client_id, p_language, old.id)
  returning id into new_id;
  return jsonb_build_object('receipt_id', new_id, 'receipt_no', num.out_receipt_no);
end $$;

-- Record a challan; a correction voids the one it replaces in the same step.
create or replace function public.record_challan(
  p_monthly_record_id uuid, p_type text, p_amount_paise bigint, p_paid_on date, p_paid_by public.challan_payer,
  p_paid_by_partner_id uuid default null, p_trrn text default null, p_challan_number text default null,
  p_evidence_path text default null, p_replaces_id uuid default null, p_replace_reason text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; new_id uuid;
begin
  perform public.require_app_user();
  select client_id into cid from public.monthly_records where id = p_monthly_record_id;
  if not found then raise exception 'Month not found' using errcode = 'P0002'; end if;
  perform 1 from public.clients where id = cid for update;
  if p_replaces_id is not null then
    if coalesce(trim(p_replace_reason), '') = '' then raise exception 'Say why the challan is being corrected' using errcode = 'P0001'; end if;
    update public.challan_transactions set voided = true, void_reason = p_replace_reason
    where id = p_replaces_id and monthly_record_id = p_monthly_record_id and not voided;
    if not found then raise exception 'The challan being corrected was not found' using errcode = 'P0002'; end if;
  end if;
  insert into public.challan_transactions (monthly_record_id, challan_type, challan_number, trrn, amount_paise, paid_on, paid_by,
                                           paid_by_partner_id, evidence_file_path, replaces_id, notes)
  values (p_monthly_record_id, p_type, nullif(trim(p_challan_number), ''), nullif(trim(p_trrn), ''), p_amount_paise, p_paid_on, p_paid_by,
          case when p_paid_by = 'us' then p_paid_by_partner_id end, p_evidence_path, p_replaces_id, p_notes)
  returning id into new_id;
  return new_id;
end $$;

-- A partner confirms the challan proof (the database refuses without an evidence file).
create or replace function public.verify_challan(p_challan_id uuid, p_evidence_path text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_app_user();
  if p_evidence_path is not null then
    update public.challan_transactions set evidence_file_path = p_evidence_path
    where id = p_challan_id and evidence_file_path is null and not voided;
  end if;
  update public.challan_transactions set verified_at = now(), verified_by = auth.uid()
  where id = p_challan_id and not voided and verified_at is null;
  if not found then raise exception 'Challan not found, void or already verified' using errcode = 'P0001'; end if;
end $$;

-- Create the month for every active regular client, from their defaults. Never duplicates.
create or replace function public.start_month(p_month date) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer; due_day integer;
begin
  perform public.require_app_user();
  if extract(day from p_month) <> 1 then raise exception 'Use the first day of the month' using errcode = 'P0001'; end if;
  select s.due_day into due_day from public.settings s where id = 1;
  insert into public.monthly_records (client_id, wage_month, charge_paise, challan_payer, due_date, handled_by_partner_id)
  select c.id, p_month, c.default_charge_paise, c.challan_payer_default,
         (p_month + interval '1 month')::date + (least(coalesce(due_day, 15), 28) - 1),
         c.handled_by_partner_id
  from public.clients c
  where c.active and c.kind = 'regular'
  on conflict (client_id, wage_month) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ─── Grants: API users call the functions; helpers stay internal ───────────
do $$
declare f text;
begin
  foreach f in array array[
    'guard_monthly_amounts()', 'client_outstanding(uuid)', 'client_advances(uuid)', 'require_app_user()',
    'apply_to_outstanding(uuid, uuid, bigint, uuid[], boolean)',
    'record_payment(uuid, uuid, bigint, date, public.payment_mode, uuid, public.language_code, text, text, uuid[], boolean)',
    'use_advance(uuid, uuid[])', 'void_payment(uuid, text)', 'reissue_receipt(uuid, text, public.language_code)',
    'record_challan(uuid, text, bigint, date, public.challan_payer, uuid, text, text, text, uuid, text, text)',
    'verify_challan(uuid, text)', 'start_month(date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'client_outstanding(uuid)', 'client_advances(uuid)',
    'record_payment(uuid, uuid, bigint, date, public.payment_mode, uuid, public.language_code, text, text, uuid[], boolean)',
    'use_advance(uuid, uuid[])', 'void_payment(uuid, text)', 'reissue_receipt(uuid, text, public.language_code)',
    'record_challan(uuid, text, bigint, date, public.challan_payer, uuid, text, text, text, uuid, text, text)',
    'verify_challan(uuid, text)', 'start_month(date)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

revoke all on public.month_parts, public.client_balances, public.month_status from anon;
grant select on public.month_parts, public.client_balances, public.month_status to authenticated;
