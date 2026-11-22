-- Section 11 update, part 3: the financial history as a VIEW (never a stored table).
-- Every row is derived from one authoritative source:
--   payments + payment_allocations → money received, split into pf / esic / charge / extra / advance
--   challan_transactions (paid by us) → government money deposited
--   expenses, partner_transfers       → partner money movements
-- A void never deletes anything: the original row stays and a reversal row is added on the void date.
-- (UI wording: Received / Deposited / Earned / Owes / Advance — never "ledger".)

-- Voids on expenses and transfers need a recorded date (reversal rows are dated by it).
alter table public.expenses          add column voided_at timestamptz;
alter table public.partner_transfers add column voided_at timestamptz;
alter table public.expenses          add constraint expenses_void_reason check (not voided or void_reason is not null);
alter table public.partner_transfers add constraint partner_transfers_void_reason check (not voided or void_reason is not null);

create or replace function public.stamp_void() returns trigger
language plpgsql as $$
begin
  if old.voided and (new.voided is distinct from old.voided or new.amount_paise is distinct from old.amount_paise) then
    raise exception 'A void entry cannot change.' using errcode = 'P0001';
  end if;
  if not old.voided and new.amount_paise is distinct from old.amount_paise then
    raise exception 'Amounts cannot be edited. Void it and add a new entry.' using errcode = 'P0001';
  end if;
  if new.voided and not old.voided then new.voided_at := coalesce(new.voided_at, now()); end if;
  return new;
end $$;
create trigger expenses_stamp_void before update on public.expenses for each row execute function public.stamp_void();
create trigger partner_transfers_stamp_void before update on public.partner_transfers for each row execute function public.stamp_void();
revoke all on function public.stamp_void() from public, anon, authenticated;

create view public.financial_ledger with (security_invoker = true) as
with events as (
  -- Money received at payment time, by part
  select 'alloc:' || a.id::text                          as entry_id,
         a.component::text || '_received'                 as event,
         a.component::text                                as part,
         p.received_on                                    as entry_date,
         p.client_id, a.monthly_record_id, a.extra_charge_id, p.id as payment_id, null::uuid as challan_transaction_id,
         p.received_by_partner_id                         as partner_id,
         p.mode::text                                     as mode,
         a.amount_paise, 'in'::text                       as direction,
         p.reference, null::text                          as description,
         p.voided, (p.voided_at at time zone 'Asia/Kolkata')::date as voided_on, a.created_at
  from public.payment_allocations a
  join public.payments p on p.id = a.payment_id
  where not a.from_advance

  union all
  -- Part of a payment not applied to any month: held as advance
  select 'adv:' || p.id::text, 'advance_received', 'advance', p.received_on,
         p.client_id, null, null, p.id, null, p.received_by_partner_id, p.mode::text,
         p.amount_paise - coalesce(s.applied, 0), 'in', p.reference, null,
         p.voided, (p.voided_at at time zone 'Asia/Kolkata')::date, p.created_at
  from public.payments p
  left join (select payment_id, sum(amount_paise) applied from public.payment_allocations
             where not from_advance group by payment_id) s on s.payment_id = p.id
  where p.amount_paise - coalesce(s.applied, 0) > 0

  union all
  -- Advance used later: leaves "advance" ...
  select 'advuse:' || a.id::text, 'advance_used', 'advance', (a.created_at at time zone 'Asia/Kolkata')::date,
         p.client_id, a.monthly_record_id, a.extra_charge_id, p.id, null, p.received_by_partner_id, p.mode::text,
         a.amount_paise, 'out', p.reference, null,
         p.voided, (p.voided_at at time zone 'Asia/Kolkata')::date, a.created_at
  from public.payment_allocations a join public.payments p on p.id = a.payment_id
  where a.from_advance

  union all
  -- ... and lands on the month's pf / esic / charge / extra
  select 'advapply:' || a.id::text, a.component::text || '_received', a.component::text, (a.created_at at time zone 'Asia/Kolkata')::date,
         p.client_id, a.monthly_record_id, a.extra_charge_id, p.id, null, p.received_by_partner_id, p.mode::text,
         a.amount_paise, 'in', p.reference, 'from advance',
         p.voided, (p.voided_at at time zone 'Asia/Kolkata')::date, a.created_at
  from public.payment_allocations a join public.payments p on p.id = a.payment_id
  where a.from_advance

  union all
  -- Government money deposited by us
  select 'challan:' || c.id::text, c.challan_type || '_deposited', c.challan_type, c.paid_on,
         m.client_id, c.monthly_record_id, null, null, c.id, c.paid_by_partner_id, null,
         c.amount_paise, 'out', coalesce(c.trrn, c.challan_number), null,
         c.voided, (c.voided_at at time zone 'Asia/Kolkata')::date, c.created_at
  from public.challan_transactions c
  join public.monthly_records m on m.id = c.monthly_record_id
  where c.paid_by = 'us'

  union all
  -- Shared expenses (ink, paper…)
  select 'expense:' || e.id::text, 'expense', 'expense', e.spent_on,
         null, null, null, null, null, e.paid_by_partner_id, null,
         e.amount_paise, 'out', null, e.description,
         e.voided, (e.voided_at at time zone 'Asia/Kolkata')::date, e.created_at
  from public.expenses e

  union all
  -- Money passed between partners: one row for each side
  select 'xfer-out:' || t.id::text, 'transfer_out', t.kind, t.transferred_on,
         null, null, null, null, null, t.from_partner_id, null,
         t.amount_paise, 'out', null, t.note,
         t.voided, (t.voided_at at time zone 'Asia/Kolkata')::date, t.created_at
  from public.partner_transfers t
  union all
  select 'xfer-in:' || t.id::text, 'transfer_in', t.kind, t.transferred_on,
         null, null, null, null, null, t.to_partner_id, null,
         t.amount_paise, 'in', null, t.note,
         t.voided, (t.voided_at at time zone 'Asia/Kolkata')::date, t.created_at
  from public.partner_transfers t
)
select entry_id, event, part, false as is_reversal, entry_date, client_id, monthly_record_id, extra_charge_id,
       payment_id, challan_transaction_id, partner_id, mode, amount_paise, direction,
       case direction when 'in' then amount_paise else -amount_paise end as signed_paise,
       reference, description, created_at
from events
union all
select entry_id || ':reversal', event, part, true, coalesce(voided_on, entry_date), client_id, monthly_record_id, extra_charge_id,
       payment_id, challan_transaction_id, partner_id, mode, amount_paise,
       case direction when 'in' then 'out' else 'in' end,
       case direction when 'in' then -amount_paise else amount_paise end,
       reference, 'reversal (voided)', created_at
from events
where voided;

revoke all on public.financial_ledger from anon;
grant select on public.financial_ledger to authenticated;
