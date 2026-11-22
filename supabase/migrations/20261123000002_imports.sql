-- Section 11 update, part 2: import tracking.
-- The original Excel is never modified; every imported row points back to its cell.

create table public.import_batches (
  id                     uuid primary key default gen_random_uuid(),
  kind                   text not null check (kind in ('monthly_sheet', 'vendor_codes')),
  file_name              text not null,
  file_hash              text not null check (file_hash ~ '^[0-9a-f]{64}$'),    -- sha256 of the file bytes
  mapping_hash           text,                                                  -- sha256 of the approved mapping CSV
  status                 text not null default 'started' check (status in ('started', 'completed', 'failed')),
  total_rows             integer not null default 0,
  successful_rows        integer not null default 0,
  skipped_rows           integer not null default 0,
  failed_rows            integer not null default 0,
  reconciliation_status  text not null default 'pending' check (reconciliation_status in ('pending', 'matched', 'mismatched')),
  summary_before         jsonb,
  summary_after          jsonb,
  error                  text,
  imported_by            text not null,       -- who ran the script (name or email)
  imported_at            timestamptz not null default now(),
  completed_at           timestamptz
);
-- The same file with the same mapping can only be imported once successfully.
create unique index import_batches_once on public.import_batches (kind, file_hash, coalesce(mapping_hash, '')) where status = 'completed';

create table public.import_row_log (
  id          bigint generated always as identity primary key,
  batch_id    uuid not null references public.import_batches(id),
  source_ref  text not null,                    -- e.g. 'SEPT26'!B45
  raw         jsonb not null,
  outcome     text not null check (outcome in ('imported', 'unchanged', 'skipped', 'needs_review', 'error')),
  message     text,
  target_table text,
  target_id   uuid
);
create index import_row_log_batch_idx on public.import_row_log (batch_id, outcome);

create table public.client_mapping_decisions (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid references public.import_batches(id),
  raw_name       text not null,
  normalized     text not null,
  decision       text not null check (decision in ('client', 'walk_in', 'ignore')),
  client_id      uuid references public.clients(id),
  confidence     text,
  approved_by    text not null,
  approved_note  text,
  decided_at     timestamptz not null default now(),
  check (decision = 'ignore' or client_id is not null)
);
create index client_mapping_decisions_raw_idx on public.client_mapping_decisions (normalized);

-- Traceability + idempotency on everything an import can create.
alter table public.clients           add column import_batch_id uuid references public.import_batches(id), add column source_ref text unique;
alter table public.monthly_records   add column import_batch_id uuid references public.import_batches(id), add column source_ref text unique;
alter table public.extra_charges     add column import_batch_id uuid references public.import_batches(id), add column source_ref text unique;
alter table public.expenses          add column import_batch_id uuid references public.import_batches(id), add column source_ref text unique;
alter table public.partner_transfers add column import_batch_id uuid references public.import_batches(id), add column source_ref text unique;

do $$
declare t text;
begin
  foreach t in array array['import_batches', 'import_row_log', 'client_mapping_decisions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    -- Partners can read import history in the app; only the import script (database owner) writes it.
    execute format('create policy %I on public.%I for select to authenticated using (public.is_app_user())', t || '_select', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.forbid_delete()', t || '_no_delete', t);
  end loop;
end $$;
