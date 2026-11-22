-- Section 11 update, part 1:
--   • challan_transactions: the single source for PF/ESIC challans (history never overwritten)
--   • payment_allocations.component: pf / esic / charge / extra
--   • partner_transfers.kind, message_log.status
-- No production data exists yet; data moves are written properly anyway.

-- ─── Challan transactions ───────────────────────────────────────────────────
create table public.challan_transactions (
  id                  uuid primary key default gen_random_uuid(),
  monthly_record_id   uuid not null references public.monthly_records(id),
  challan_type        text not null check (challan_type in ('pf', 'esic')),
  challan_number      text,
  trrn                text,
  amount_paise        bigint not null check (amount_paise >= 0),
  paid_on             date not null,
  paid_by             public.challan_payer not null,
  paid_by_partner_id  uuid references public.partners(id),
  evidence_file_path  text,
  verified_by         uuid,
  verified_at         timestamptz,
  replaces_id         uuid references public.challan_transactions(id),
  voided              boolean not null default false,
  void_reason         text,
  voided_at           timestamptz,
  notes               text,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- We hold the money, so we must know which partner deposited it.
  check (paid_by = 'client' or paid_by_partner_id is not null),
  -- VERIFIED = evidence attached and confirmed by a partner.
  check (verified_at is null or (evidence_file_path is not null and verified_by is not null)),
  check (not voided or void_reason is not null),
  check (challan_type <> 'pf' or trrn is not null or challan_number is not null)
);
-- One active challan per type per month; corrections void the old one first.
create unique index challan_one_active_per_type on public.challan_transactions (monthly_record_id, challan_type) where not voided;
create index challan_partner_idx on public.challan_transactions (paid_by_partner_id) where not voided;

create or replace function public.guard_challan_update() returns trigger
language plpgsql as $$
begin
  if old.voided then
    raise exception 'This challan entry is void and cannot change.' using errcode = 'P0001';
  end if;
  if (new.monthly_record_id, new.challan_type, new.challan_number, new.trrn, new.amount_paise, new.paid_on,
      new.paid_by, new.paid_by_partner_id, new.replaces_id, new.created_by, new.created_at)
     is distinct from
     (old.monthly_record_id, old.challan_type, old.challan_number, old.trrn, old.amount_paise, old.paid_on,
      old.paid_by, old.paid_by_partner_id, old.replaces_id, old.created_by, old.created_at) then
    raise exception 'Challan details cannot be edited. Void it and record the corrected challan.' using errcode = 'P0001';
  end if;
  if old.evidence_file_path is not null and new.evidence_file_path is distinct from old.evidence_file_path then
    raise exception 'Evidence already attached. Void and re-record to replace it.' using errcode = 'P0001';
  end if;
  if old.verified_at is not null and (new.verified_at, new.verified_by) is distinct from (old.verified_at, old.verified_by) then
    raise exception 'Verification cannot be changed once given.' using errcode = 'P0001';
  end if;
  if new.voided then new.voided_at := coalesce(new.voided_at, now()); end if;
  new.updated_at := now();
  return new;
end $$;
create trigger challan_transactions_guard before update on public.challan_transactions
  for each row execute function public.guard_challan_update();
create trigger challan_transactions_audit after insert or update or delete on public.challan_transactions
  for each row execute function public.audit_row();
create trigger challan_transactions_no_delete before delete on public.challan_transactions
  for each row execute function public.forbid_delete();

alter table public.challan_transactions enable row level security;
alter table public.challan_transactions force row level security;
revoke all on public.challan_transactions from anon;
create policy challan_transactions_select on public.challan_transactions for select to authenticated using (public.is_app_user());
create policy challan_transactions_insert on public.challan_transactions for insert to authenticated with check (public.is_app_user());
create policy challan_transactions_update on public.challan_transactions for update to authenticated using (public.is_app_user()) with check (public.is_app_user());

-- Move any challan details recorded on monthly_records, then drop those columns.
insert into public.challan_transactions (monthly_record_id, challan_type, trrn, amount_paise, paid_on, paid_by, paid_by_partner_id, created_by)
select id, 'pf', pf_trrn, coalesce(pf_paise, 0), pf_paid_on, coalesce(challan_paid_by, challan_payer),
       case when coalesce(challan_paid_by, challan_payer) = 'us' then coalesce(challan_paid_by_partner_id, handled_by_partner_id) end, null
from public.monthly_records
where pf_paid_on is not null and (pf_trrn is not null)
  and (coalesce(challan_paid_by, challan_payer) = 'client' or coalesce(challan_paid_by_partner_id, handled_by_partner_id) is not null);
insert into public.challan_transactions (monthly_record_id, challan_type, challan_number, amount_paise, paid_on, paid_by, paid_by_partner_id, created_by)
select id, 'esic', esic_challan_no, coalesce(esic_paise, 0), esic_paid_on, coalesce(challan_paid_by, challan_payer),
       case when coalesce(challan_paid_by, challan_payer) = 'us' then coalesce(challan_paid_by_partner_id, handled_by_partner_id) end, null
from public.monthly_records
where esic_paid_on is not null
  and (coalesce(challan_paid_by, challan_payer) = 'client' or coalesce(challan_paid_by_partner_id, handled_by_partner_id) is not null);

alter table public.monthly_records
  drop column pf_trrn, drop column pf_paid_on, drop column esic_challan_no, drop column esic_paid_on,
  drop column challan_paid_by, drop column challan_paid_by_partner_id;

-- ─── Payment parts: pf / esic / charge / extra ──────────────────────────────
create type public.allocation_part as enum ('pf', 'esic', 'charge', 'extra');

do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.payment_allocations'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%component%'
  loop
    execute format('alter table public.payment_allocations drop constraint %I', c);
  end loop;
end $$;

-- 'gov' had no PF/ESIC split; only demo/test rows can exist, mapped to pf. 'fee' → charge.
alter table public.payment_allocations
  alter column component type public.allocation_part
  using (case component::text when 'gov' then 'pf' when 'fee' then (case when extra_charge_id is null then 'charge' else 'extra' end) end)::public.allocation_part;
drop type public.allocation_component;

alter table public.payment_allocations
  add constraint payment_allocations_part_target check (
    (component = 'extra') = (extra_charge_id is not null)
    and (component <> 'extra') = (monthly_record_id is not null)
  ),
  -- true when applied later from an advance, rather than when the payment was recorded
  add column from_advance boolean not null default false;

-- A payment can never be split into more than its amount.
create or replace function public.check_allocation_total() returns trigger
language plpgsql as $$
declare total bigint; amt bigint;
begin
  select amount_paise into amt from public.payments where id = new.payment_id for update;
  select coalesce(sum(amount_paise), 0) into total from public.payment_allocations where payment_id = new.payment_id;
  if total > amt then
    raise exception 'Payment split (%) exceeds the payment (%).', total, amt using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger payment_allocations_total after insert on public.payment_allocations
  deferrable initially deferred for each row execute function public.check_allocation_total();

-- ─── Partner transfers: what kind of money moved ───────────────────────────
alter table public.partner_transfers
  add column kind text not null default 'settlement' check (kind in ('settlement', 'gov_handover'));

-- ─── WhatsApp: no "delivered" without the API telling us so ────────────────
alter table public.message_log
  add column status text not null default 'prepared' check (status in ('prepared', 'shared', 'delivered', 'read', 'failed')),
  add column shared_at timestamptz,
  add column delivered_at timestamptz,
  add column read_at timestamptz,
  add constraint message_status_matches_channel check (
    status not in ('delivered', 'read') or channel = 'whatsapp_api'
  );

-- ─── Business contact details (given by the owners) ────────────────────────
update public.settings set
  address_en = case when address_en = '' then 'Munger, Bihar' else address_en end,
  address_hi = case when address_hi = '' then 'मुंगेर, बिहार' else address_hi end,
  phones     = case when phones = '{}' then array['+919430449312'] else phones end
where id = 1;

revoke all on function public.guard_challan_update() from public, anon, authenticated;
revoke all on function public.check_allocation_total() from public, anon, authenticated;
