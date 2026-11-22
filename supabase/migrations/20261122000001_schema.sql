-- PF ESIC Desk: core schema.
-- Money is always bigint paise. Calendar dates are `date` (Asia/Kolkata).
-- A wage month is stored as the first day of the month.

set check_function_bodies = off;

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type public.challan_payer as enum ('us', 'client');
create type public.payment_mode  as enum ('cash', 'upi', 'bank');
create type public.language_code as enum ('hi', 'en');
create type public.client_kind   as enum ('regular', 'occasional');
create type public.message_channel as enum ('whatsapp_manual', 'whatsapp_api');
create type public.allocation_component as enum ('gov', 'fee');

-- ─── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.is_first_of_month(d date) returns boolean
language sql immutable as $$ select extract(day from d) = 1 $$;

-- ─── Partners and users ─────────────────────────────────────────────────────
create table public.partners (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z]$'),   -- 'A', 'R' as in the Excel REMARK column
  name        text not null,                                  -- short name: Alok
  full_name   text,                                           -- Rajeev Kumar Mishra
  phone       text check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Dated split rules, so changing the split never rewrites past settlements.
create table public.split_rules (
  id              uuid primary key default gen_random_uuid(),
  effective_from  date not null,
  partner_id      uuid not null references public.partners(id),
  percent         numeric(5,2) not null check (percent >= 0 and percent <= 100),
  created_at      timestamptz not null default now(),
  unique (effective_from, partner_id)
);

-- Only people listed here can use the app (there is no public sign-up).
create table public.app_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  partner_id  uuid references public.partners(id),
  role        text not null default 'admin' check (role in ('admin')),
  created_at  timestamptz not null default now()
);

-- ─── Clients ────────────────────────────────────────────────────────────────
create table public.clients (
  id                      uuid primary key default gen_random_uuid(),
  kind                    public.client_kind not null default 'regular',
  firm_name               text not null check (length(trim(firm_name)) > 0),
  firm_name_hi            text,
  owner_name              text,
  phone                   text check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$'),
  whatsapp_phone          text check (whatsapp_phone is null or whatsapp_phone ~ '^\+91[6-9][0-9]{9}$'),
  alt_phone               text check (alt_phone is null or alt_phone ~ '^\+91[6-9][0-9]{9}$'),
  address                 text,
  pf_establishment_code   text,
  esic_code               text check (esic_code is null or esic_code ~ '^[0-9]{17}$'),
  esic_code_verified      boolean not null default false,
  default_charge_paise    bigint not null default 0 check (default_charge_paise >= 0),
  handled_by_partner_id   uuid references public.partners(id),   -- null = "N" (no charge)
  challan_payer_default   public.challan_payer not null default 'us',
  preferred_language      public.language_code not null default 'hi',
  active                  boolean not null default true,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index clients_active_idx on public.clients (active, kind);

create table public.client_aliases (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id),
  raw_name         text not null,
  normalized_name  text not null,
  created_at       timestamptz not null default now(),
  unique (normalized_name)
);
create index client_aliases_client_idx on public.client_aliases (client_id);

-- ─── Monthly records ────────────────────────────────────────────────────────
create table public.monthly_records (
  id                          uuid primary key default gen_random_uuid(),
  client_id                   uuid not null references public.clients(id),
  wage_month                  date not null check (public.is_first_of_month(wage_month)),
  pf_paise                    bigint check (pf_paise >= 0),     -- null = not entered yet; 0 = nil month
  esic_paise                  bigint check (esic_paise >= 0),
  charge_paise                bigint not null default 0 check (charge_paise >= 0),
  challan_payer               public.challan_payer not null,
  due_date                    date not null,
  handled_by_partner_id       uuid references public.partners(id),  -- snapshot for this month (Excel REMARK)
  pf_trrn                     text,
  pf_paid_on                  date,
  esic_challan_no             text,
  esic_paid_on                date,
  challan_paid_by             public.challan_payer,
  challan_paid_by_partner_id  uuid references public.partners(id),
  legacy_settled              boolean not null default false,       -- imported history, treated as fully paid
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (client_id, wage_month),
  check (due_date > wage_month)
);
create index monthly_records_month_idx on public.monthly_records (wage_month);

create table public.extra_charges (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references public.clients(id),
  wage_month             date not null check (public.is_first_of_month(wage_month)),
  service_type           text not null default 'other' check (service_type in
                           ('pf_claim', 'registration', 'appointment_letter', 'pf_password', 'pf_card', 'challan', 'other')),
  description            text,
  amount_paise           bigint not null check (amount_paise > 0),
  handled_by_partner_id  uuid references public.partners(id),
  done_on                date,
  legacy_settled         boolean not null default false,
  voided                 boolean not null default false,
  void_reason            text,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  check (not voided or void_reason is not null)
);
create index extra_charges_client_idx on public.extra_charges (client_id, wage_month);

create table public.attachments (
  id                 uuid primary key default gen_random_uuid(),
  monthly_record_id  uuid not null references public.monthly_records(id),
  kind               text not null check (kind in ('pf_challan', 'esic_challan', 'other')),
  file_path          text not null,
  uploaded_by        uuid default auth.uid(),
  created_at         timestamptz not null default now()
);

-- ─── Payments, allocations, receipts ────────────────────────────────────────
create table public.payments (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references public.clients(id),
  amount_paise            bigint not null check (amount_paise > 0),
  received_on             date not null,
  mode                    public.payment_mode not null,
  received_by_partner_id  uuid not null references public.partners(id),
  reference               text,
  notes                   text,
  idempotency_key         uuid not null unique,   -- generated on the phone; a double-tap can't save twice
  voided                  boolean not null default false,
  void_reason             text,
  voided_at               timestamptz,
  voided_by               uuid,
  created_by              uuid default auth.uid(),
  created_at              timestamptz not null default now(),
  check (not voided or void_reason is not null)
);
create index payments_client_idx on public.payments (client_id, received_on);

create table public.payment_allocations (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null references public.payments(id),
  monthly_record_id  uuid references public.monthly_records(id),
  extra_charge_id    uuid references public.extra_charges(id),
  component          public.allocation_component not null,
  amount_paise       bigint not null check (amount_paise > 0),
  created_at         timestamptz not null default now(),
  check (num_nonnulls(monthly_record_id, extra_charge_id) = 1),
  check (component = 'fee' or monthly_record_id is not null)   -- government money only belongs to a month
);
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
create index payment_allocations_record_idx on public.payment_allocations (monthly_record_id);
create index payment_allocations_extra_idx on public.payment_allocations (extra_charge_id);

-- One row per financial year; locked while a number is taken, so numbers are gapless.
create table public.receipt_counters (
  financial_year  text primary key check (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  last_no         integer not null default 0 check (last_no >= 0)
);

create table public.receipts (
  id                   uuid primary key default gen_random_uuid(),
  receipt_no           text not null unique,
  financial_year       text not null,
  seq                  integer not null check (seq > 0),
  payment_id           uuid not null references public.payments(id),
  client_id            uuid not null references public.clients(id),
  language             public.language_code not null,
  file_path            text,
  voided               boolean not null default false,
  void_reason          text,
  voided_at            timestamptz,
  replaces_receipt_id  uuid references public.receipts(id),
  issued_by            uuid default auth.uid(),
  issued_at            timestamptz not null default now(),
  unique (financial_year, seq),
  check (not voided or void_reason is not null)
);
create index receipts_client_idx on public.receipts (client_id, issued_at);

-- ─── Partner money ──────────────────────────────────────────────────────────
create table public.expenses (
  id                  uuid primary key default gen_random_uuid(),
  spent_on            date not null,
  month               date not null check (public.is_first_of_month(month)),
  amount_paise        bigint not null check (amount_paise > 0),
  description         text not null,
  paid_by_partner_id  uuid references public.partners(id),
  voided              boolean not null default false,
  void_reason         text,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now()
);

create table public.partner_transfers (
  id               uuid primary key default gen_random_uuid(),
  from_partner_id  uuid not null references public.partners(id),
  to_partner_id    uuid not null references public.partners(id),
  amount_paise     bigint not null check (amount_paise > 0),
  transferred_on   date not null,
  month            date check (month is null or public.is_first_of_month(month)),
  note             text,
  voided           boolean not null default false,
  void_reason      text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  check (from_partner_id <> to_partner_id)
);

-- ─── Messages and settings ──────────────────────────────────────────────────
create table public.message_log (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id),
  monthly_record_id  uuid references public.monthly_records(id),
  payment_id         uuid references public.payments(id),
  type               text not null check (type in
                       ('dues_we_pay', 'challan_ready_client_pays', 'payment_received', 'challan_filed', 'overdue', 'receipt', 'other')),
  language           public.language_code not null,
  channel            public.message_channel not null default 'whatsapp_manual',
  body               text not null,
  sent_by            uuid default auth.uid(),
  sent_at            timestamptz not null default now()
);
create index message_log_client_idx on public.message_log (client_id, sent_at);
create index message_log_record_idx on public.message_log (monthly_record_id);

create table public.settings (
  id                 integer primary key default 1 check (id = 1),   -- single row
  business_name_en   text not null default '',
  business_name_hi   text not null default '',
  address_en         text not null default '',
  address_hi         text not null default '',
  map_url            text,
  phones             text[] not null default '{}',
  logo_path          text,
  signature_path     text,
  due_day            integer not null default 15 check (due_day between 1 and 28),
  reminder_days      integer[] not null default '{5,2}',
  updated_at         timestamptz not null default now()
);

create table public.message_templates (
  key         text not null check (key in
                ('dues_we_pay', 'challan_ready_client_pays', 'payment_received', 'challan_filed', 'overdue')),
  language    public.language_code not null,
  body        text not null,
  updated_at  timestamptz not null default now(),
  primary key (key, language)
);

-- ─── Audit log ──────────────────────────────────────────────────────────────
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_id      text,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  actor       uuid,
  at          timestamptz not null default now()
);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

-- updated_at triggers
create trigger partners_updated_at        before update on public.partners        for each row execute function public.set_updated_at();
create trigger clients_updated_at         before update on public.clients         for each row execute function public.set_updated_at();
create trigger monthly_records_updated_at before update on public.monthly_records for each row execute function public.set_updated_at();
create trigger settings_updated_at        before update on public.settings        for each row execute function public.set_updated_at();
create trigger templates_updated_at       before update on public.message_templates for each row execute function public.set_updated_at();
