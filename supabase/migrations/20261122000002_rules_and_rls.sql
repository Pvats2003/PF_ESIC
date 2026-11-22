-- Integrity rules (audit, no hard deletes, immutable receipts, gapless numbering) and RLS.

-- ─── Audit trail for every money-related table ─────────────────────────────
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (table_name, row_id, action, old_data, new_data, actor)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', ''),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'monthly_records', 'extra_charges', 'payments', 'payment_allocations',
    'receipts', 'expenses', 'partner_transfers', 'split_rules', 'partners', 'settings'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ─── Nothing involving money is ever hard-deleted (void or archive instead) ─
create or replace function public.forbid_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Rows in % cannot be deleted. Void or archive them instead.', tg_table_name
    using errcode = 'P0001';
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'monthly_records', 'extra_charges', 'payments', 'payment_allocations', 'receipts',
    'receipt_counters', 'expenses', 'partner_transfers', 'message_log', 'audit_log', 'split_rules'
  ] loop
    execute format('create trigger %I before delete on public.%I
                    for each row execute function public.forbid_delete()', t || '_no_delete', t);
  end loop;
end $$;

-- ─── Issued receipts are never edited: only voided (once), or given a file ──
create or replace function public.guard_receipt_update() returns trigger
language plpgsql as $$
begin
  if old.voided then
    raise exception 'Receipt % is void and cannot change.', old.receipt_no using errcode = 'P0001';
  end if;
  if (new.receipt_no, new.financial_year, new.seq, new.payment_id, new.client_id, new.language,
      new.replaces_receipt_id, new.issued_by, new.issued_at)
     is distinct from
     (old.receipt_no, old.financial_year, old.seq, old.payment_id, old.client_id, old.language,
      old.replaces_receipt_id, old.issued_by, old.issued_at) then
    raise exception 'Issued receipts cannot be edited. Void it and issue a new one.' using errcode = 'P0001';
  end if;
  if old.file_path is not null and new.file_path is distinct from old.file_path then
    raise exception 'Receipt file cannot be replaced.' using errcode = 'P0001';
  end if;
  if new.voided and (new.void_reason is null or length(trim(new.void_reason)) = 0) then
    raise exception 'A reason is needed to void a receipt.' using errcode = 'P0001';
  end if;
  if new.voided then new.voided_at := coalesce(new.voided_at, now()); end if;
  return new;
end $$;
create trigger receipts_guard before update on public.receipts
  for each row execute function public.guard_receipt_update();

-- Payments: only the void fields may change, and voiding is one-way.
create or replace function public.guard_payment_update() returns trigger
language plpgsql as $$
begin
  if old.voided then
    raise exception 'This payment is void and cannot change.' using errcode = 'P0001';
  end if;
  if (new.client_id, new.amount_paise, new.received_on, new.mode, new.received_by_partner_id,
      new.reference, new.idempotency_key, new.created_by, new.created_at)
     is distinct from
     (old.client_id, old.amount_paise, old.received_on, old.mode, old.received_by_partner_id,
      old.reference, old.idempotency_key, old.created_by, old.created_at) then
    raise exception 'Payments cannot be edited. Void it and record it again.' using errcode = 'P0001';
  end if;
  if new.voided then
    new.voided_at := coalesce(new.voided_at, now());
    new.voided_by := coalesce(new.voided_by, auth.uid());
  end if;
  return new;
end $$;
create trigger payments_guard before update on public.payments
  for each row execute function public.guard_payment_update();

create or replace function public.forbid_update() returns trigger
language plpgsql as $$
begin
  raise exception 'Rows in % cannot be edited.', tg_table_name using errcode = 'P0001';
end $$;
create trigger payment_allocations_no_update before update on public.payment_allocations
  for each row execute function public.forbid_update();
create trigger audit_log_no_update before update on public.audit_log
  for each row execute function public.forbid_update();

-- ─── Split rules must add up to 100% for each effective date ───────────────
create or replace function public.check_split_total() returns trigger
language plpgsql as $$
declare total numeric;
begin
  select coalesce(sum(percent), 0) into total from public.split_rules where effective_from = new.effective_from;
  if total <> 100 then
    raise exception 'Partner split for % adds up to %%%, it must be 100%%.', new.effective_from, total
      using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger split_rules_total after insert or update on public.split_rules
  deferrable initially deferred for each row execute function public.check_split_total();

-- ─── Gapless receipt numbers, per financial year (April–March) ─────────────
create or replace function public.financial_year_of(d date) returns text
language sql immutable as $$
  select (y)::text || '-' || lpad(((y + 1) % 100)::text, 2, '0')
  from (select case when extract(month from d) >= 4 then extract(year from d)::int
                    else extract(year from d)::int - 1 end as y) s
$$;

-- Internal: takes the next number. The counter row stays locked until the
-- surrounding transaction ends, and a rollback gives the number back, so
-- there are never gaps. Not callable through the API.
create or replace function public.take_receipt_number(p_date date)
returns table (out_financial_year text, out_seq integer, out_receipt_no text)
language plpgsql as $$
declare
  fy text := public.financial_year_of(p_date);
  n  integer;
begin
  insert into public.receipt_counters (financial_year, last_no) values (fy, 0)
    on conflict (financial_year) do nothing;
  update public.receipt_counters c set last_no = c.last_no + 1
    where c.financial_year = fy returning c.last_no into n;
  return query select fy, n, 'R/' || fy || '/' || lpad(n::text, 4, '0');
end $$;

-- ─── Access: only allow-listed app users ────────────────────────────────────
create or replace function public.is_app_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users where id = auth.uid())
$$;

-- Issue a receipt for a payment. Numbered by the payment's date (IST calendar date).
create or replace function public.issue_receipt(
  p_payment_id uuid,
  p_language public.language_code,
  p_replaces_receipt_id uuid default null
) returns public.receipts
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments;
  num record;
  r   public.receipts;
begin
  if not public.is_app_user() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into pay from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if pay.voided then raise exception 'Cannot issue a receipt for a void payment' using errcode = 'P0001'; end if;
  if p_replaces_receipt_id is not null and not exists (
       select 1 from public.receipts where id = p_replaces_receipt_id and voided) then
    raise exception 'Void the old receipt before issuing its replacement' using errcode = 'P0001';
  end if;

  select * into num from public.take_receipt_number(pay.received_on);
  insert into public.receipts (receipt_no, financial_year, seq, payment_id, client_id, language, replaces_receipt_id)
  values (num.out_receipt_no, num.out_financial_year, num.out_seq, pay.id, pay.client_id, p_language, p_replaces_receipt_id)
  returning * into r;
  return r;
end $$;

-- Supabase grants EXECUTE on new functions to anon/authenticated by default,
-- so revoke explicitly from each API role, then grant back what is needed.
revoke all on function public.take_receipt_number(date) from public, anon, authenticated;
revoke all on function public.issue_receipt(uuid, public.language_code, uuid) from public, anon, authenticated;
revoke all on function public.is_app_user() from public, anon, authenticated;
revoke all on function public.audit_row() from public, anon, authenticated;
grant execute on function public.issue_receipt(uuid, public.language_code, uuid) to authenticated;
grant execute on function public.is_app_user() to authenticated;

-- ─── Row Level Security ─────────────────────────────────────────────────────
-- Logged-out visitors (anon) get nothing. Logged-in users who are not in
-- app_users also get nothing. Nobody can delete through the API.
do $$
declare t text;
begin
  foreach t in array array[
    'partners', 'split_rules', 'app_users', 'clients', 'client_aliases', 'monthly_records',
    'extra_charges', 'attachments', 'payments', 'payment_allocations', 'receipt_counters',
    'receipts', 'expenses', 'partner_transfers', 'message_log', 'settings', 'message_templates', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;

  -- Read + write (no delete)
  foreach t in array array[
    'partners', 'split_rules', 'clients', 'client_aliases', 'monthly_records', 'extra_charges',
    'attachments', 'payments', 'payment_allocations', 'expenses', 'partner_transfers',
    'message_log', 'settings', 'message_templates'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_app_user())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_app_user())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_app_user()) with check (public.is_app_user())', t || '_update', t);
  end loop;

  -- Read only through the API (written by triggers / functions / admin scripts)
  foreach t in array array['app_users', 'receipts', 'audit_log'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_app_user())', t || '_select', t);
  end loop;
end $$;

-- Receipts may be voided (and given their file) from the app.
create policy receipts_update on public.receipts for update to authenticated
  using (public.is_app_user()) with check (public.is_app_user());
-- receipt_counters: no policies at all → unreachable through the API.
