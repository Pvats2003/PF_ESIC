# PF ESIC Desk

Client, collection and receipt manager for a two-partner PF/ESIC consultancy in Bihar (Alok = `A`, Rajeev Kumar Mishra = `R`).
Replaces a monthly Excel sheet plus handwritten notes. **Desktop-first** (sidebar, wide tables, keyboard), fully usable
on phones; installable PWA. Business: Rajeev Kumar Mishra, Munger, Bihar, 94304 49312.

@AGENTS.md

## Status

- **Phase 0 (setup): done.** Schema + RLS, auth (allow-list, no sign-up), design tokens, `/design` style guide, receipt component, PWA shell, CI.
- **Section 11 design update: adopted** (see `docs/design-update-11.md`): challan_transactions, import tracking,
  pf/esic/charge/extra payment parts, `financial_ledger` VIEW, message prepared/shared states.
- **Phase 1 (Excel import): done as a FRESH START.** The owners chose not to bring old history over: `npm run import:clients`
  imported only the 38 clients on the Nov 26 list (charge, partner, PF/ESIC codes, spellings as aliases) into Supabase.
  No months, payments, extras or adjustments were imported. The full-history importer (`import:map` / `import:apply`) stays
  in the repo, unused, in case history is ever wanted.
- **Live Supabase:** project `zvrwooosqbnvrmwuidyz` (Mumbai). Schema applied via SQL Editor from the migrations. The session's
  `pf_esic` cloud environment holds the secret key as a proxy-injected network secret (scripts get `SUPABASE_SECRET_KEY=proxy-injected`,
  and Node fetch needs `NODE_USE_ENV_PROXY=1`).
- **Phase 2 slice 1: done.** App shell (sidebar / bottom tabs), This month board (`/`), Start month, Fast entry (`/entry`),
  Clients (`/clients`), Client page (`/clients/[id]`), Record payment sheet (with "Use ₹X advance?"), receipt share/download
  (`/receipts/[id]`).
- **Phase 2 slice 2: done.** Add/edit clients (phones normalised, ESIC 17 digits + "checked" tick), challans (record /
  correct by replace with reason / upload proof ≤ 4 MB / confirm client proof), WhatsApp reminders (template-built,
  editable, Hindi/English, logged as shared), Today's queue (`/queue`: overdue → reminders → challans to file → proof →
  receipts, one at a time).
- **Phase 2 slice 3: done.** Settings (`/settings`: business profile en/hi, phones, due day, reminder days, the 5 message
  templates × 2 languages with live preview, dated partner split). Reports (`/reports?tab=&from=YYYY-MM&to=YYYY-MM`):
  reconciliation (received / PF+ESIC / deposited / still to deposit / earned / owes; tabs partner, client, month, PF,
  ESIC, mode; mismatch list), partner settlement ("Rajeev → Alok ₹X", `src/lib/domain/settlement.ts`), receipt register
  (valid + void), Excel export (`/reports/export`, old sheet layout + PAYMENTS). Void payment and reissue receipt in the UI.
  Phone nav: This month · Today · Clients · Reports · More. Next: command palette, swipe actions, month-closed moment,
  expenses + partner transfers entry, walk-in quick service, client yearly statement PDF.
- **Live database updates are paste-once SQL files** built from the new migrations (update 2 = 20261125, update 3 = 20261126,
  update 4 = 20261127). Write migrations so they can run twice (`create or replace`, `on conflict do nothing`).
- Reports read `live_ledger` (financial_ledger minus legacy_settled months), so imported history never distorts
  "government money held".
- Phase 2 (core app) and Phase 3 (automation) follow; see the brief.

## Commands

| What | Command |
| --- | --- |
| Dev server against the live Supabase (needs `.env.local`) | `npm run dev` |
| Local database with made-up demo clients (no Supabase needed) | `npm run dev:db` then `npm run dev:local` → sign in demo@pfesic.app / demo1234 |
| Everything CI runs (lint, types, unit, DB) | `npm run check` |
| Unit tests (money, words, dates, phones, contrast) | `npm test` |
| DB tests: migrations, RLS, receipt numbering (needs Postgres, not Supabase) | `npm run test:db` |
| End-to-end: smoke + happy path (creates `pfesic_e2e`, builds, starts on :3200) | `npm run test:e2e` |
| Design screenshots 390×844 + 1440×900, light + dark | `npm run screenshots -- /design docs/screenshots --full` (dev server on :3100, or set `BASE_URL`) |
| Add / remove a partner login | `npm run user:add -- email@x.com A` · `npm run user:add -- email@x.com --remove` |
| Demo data (refuses if real clients exist) | `npm run db:seed-demo` |
| Excel import step 1: suggest client mapping (reads `data/*.xlsx`, never modifies them) | `npm run import:map` |
| Excel import step 2: import the reviewed files (`--dry-run` first) | `npm run import:apply -- --dry-run` |
| Fresh-start client import (current list only; safe to re-run) | `npm run import:clients -- --dry-run` |
| Regenerate PWA icons from `public/icons/icon.svg` | `npm run icons` |

DB tests use `TEST_DATABASE_ADMIN_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`). They create the
throwaway databases `pfesic_test` and `pfesic_seed_test`, load `tests/supabase-shim.sql` (fake `auth`/`storage` schemas and
API roles), then every migration in order.

## Folder map

```
src/app/                 routes (App Router). /design = living style guide, /login, /offline, /auth/signout
src/proxy.ts             Next 16 "proxy" (was middleware): refreshes the session, sends signed-out users to /login
src/components/ui/       customised primitives: button, input (MoneyInput), card, status-chip, money, stat-card,
                         countdown-chip, progress-ring, bottom-sheet (vaul), segmented, table, toaster, empty-state, skeleton
src/components/receipt/  Receipt: HTML document (fixed light palette), en + hi
src/lib/format/          money (paise), dates (IST, wage months, FY), phone (E.164), words (Indian amount in words)
src/lib/domain/          business rules (countdown; allocation + status come in Phase 2)
src/lib/supabase/        server / browser / proxy clients; env.ts
src/lib/data/db.ts       THE data door: `getDb().rpc(fn, args)` → supabase.rpc in prod, `select public.fn(...)` on local Postgres
                         (as the demo partner, role `authenticated`, so RLS applies) when LOCAL_DATABASE_URL is set
src/app/(app)/           signed-in screens + `actions.ts` (server actions: Zod-validate, then one rpc)
src/components/{app,board,entry,clients,payment,challan,messages,queue}/  screen components
src/lib/data/storage.ts  private file uploads (Supabase Storage bucket `challans`; `.local-uploads/` in development)
src/lib/domain/          board (totals/filters/search), receipt (mapping + message), messages (reminders), queue (Today), countdown
src/lib/demo/            deterministic made-up demo data
src/lib/import/          Excel import: normalize (spellings), parse-workbook (sheets → rows), mapping (suggestions), excel-grid (exceljs adapter)
supabase/migrations/     SQL migrations (the only way the schema changes)
scripts/                 seed-demo, add-user, screenshot, make-icons, db-test-setup (import-excel in Phase 1)
tests/unit|db|e2e        Vitest unit, Vitest+pg database, Playwright
data/                    real Excel + mapping CSV: gitignored, never committed
```

## Conventions (follow these)

**Money**
- Always integer **paise**: `bigint` in Postgres, `number` (safe integer) in TS. Never floats. Parse user input with `parseRupeesToPaise`.
- Display only through `formatINR` / `<Money>` → `₹1,47,555` (compact `₹1.5 L` only on summary cards). Tabular figures, right-aligned in tables.
- Amount due for a month: challan payer `us` → PF + ESIC + charge + extras; `client` → charge + extras.
- When a payment covers a "we pay" month, allocate **government money (PF+ESIC) first, then the fee** (`payment_allocations.component`).

**Dates**
- Calendar dates are `YYYY-MM-DD` strings (`ISODate`), never `Date` objects, always Asia/Kolkata (`todayIST()`).
- A wage month is its first day (`2026-11-01`). Due date = `due_day` (default 15) of the next month (`dueDateFor`).
- The default working month is the previous calendar month (`currentWageMonth`).
- Display `DD/MM/YYYY` (`formatDate`) or `15 Dec` (`formatDayMonth`). Financial year April–March (`financialYear`).

**Money model (Section 11)**
- Government money (PF, ESIC), our fees (charge, extras), advances, deposits and partner money are always separate.
  Payment parts are `pf | esic | charge | extra`; anything not applied is advance. Split order: oldest month, then PF → ESIC → charge → extras.
- `financial_ledger` is a VIEW over payments/allocations/challan_transactions/expenses/partner_transfers. Never a table,
  never written to. Voids show as reversal rows.
- Challans live only in `challan_transactions` (one active per month+type; correct by void + replace; VERIFIED needs evidence + partner).
- Statuses are computed in the `month_status` view (amount / notification / payment / challan / receipt + overdue + overall);
  see docs/design-update-11.md §4. Challan done: payer us → TRRN/number enough; payer client → verified evidence.
  ₹0 due to us → payment and receipt NOT_REQUIRED.
- Money moves only through the SQL functions (`record_payment` etc.), called from server actions after Zod validation.
- Screens read only through SQL functions too (`board`, `client_detail`, `clients_overview`, `receipt_data`) and write
  through `set_month_amounts`, `log_message`, `start_month`, `record_payment`. Never query tables directly from the app.
- New SQL for the live Supabase: also ship it as a paste-once file for the SQL Editor (the owners apply it there).
  `record_payment(..., p_use_advance)` applies an advance only when the partner ticks "Use ₹X advance?".
- Amounts can't be lowered below what's received (void + re-record); raising them flags receipts for reissue.
- UI never says ledger/debit/credit/allocation: use Received, Deposited, Government money with <partner>, Earned, Owes, Advance.
- Manual WhatsApp messages are only `prepared` → `shared`; delivered/read only for the API channel (DB check).

**Data integrity (enforced in the DB, tested in tests/db)**
- RLS on every table: `anon` gets nothing; signed-in users who aren't in `app_users` get nothing; no DELETE policies.
- Money rows are never hard-deleted (trigger `forbid_delete`); use `voided` + `void_reason` or `active = false`.
- Payments can only be voided; allocations never change; issued receipts never change except void (once, with a reason) and setting `file_path` once.
- Receipt numbers `R/2026-27/0001`, gapless per FY, only via `issue_receipt()` (locks `receipt_counters`; rollback returns the number).
- Every money table has an audit trigger → `audit_log`.
- Supabase grants EXECUTE on new functions to `anon`/`authenticated` by default: **revoke explicitly** in each migration that adds a function.
- `pf_paise` / `esic_paise` NULL = not entered yet; 0 = nil month.
- Phones stored as `+91XXXXXXXXXX` (`normalizeIndianPhone`). ESIC codes are 17 digits stored as **text**.

**Language**
- Receipts and messages in Hindi or English, chosen when sending (client's `preferred_language` preselected).
- Hindi number words come from the full 0–99 table in `words.ts`; never build them from parts.
- Hindi text uses Noto Sans Devanagari (`font-hindi` / `lang="hi"`). Receipts are HTML → PNG (html-to-image) → PDF, never a PDF text library.
- Not GST-registered: never show GST fields or "Tax Invoice". Footer: "This is a payment receipt, not a tax invoice."

**Design ("Modern Ledger")**
- Tokens live in `src/app/globals.css` (light + `.dark`). Use token classes (`bg-paper`, `text-ink-muted`, `bg-primary`, `text-success`…), never raw hex in app UI.
  `tests/unit/contrast.test.ts` checks every text/background pair against WCAG AA; add new pairs there.
- Type sizes only: `text-xs` 12, `sm` 14, `base` 16, `lg` 20, `xl` 28, `2xl` 40.
- Status never by colour alone: use `<StatusChip>` (icon + words).
- Tap targets ≥ 44 px (`Button` md = 44). Forms in `<BottomSheet>` on phones. Skeletons, not spinners.
- Lucide icons only, stroke 1.75. Motion via `motion/react`, 150–250 ms ease-out, respect reduced motion.
- Copy like a helpful colleague: "Record payment", "Send reminder". No "Insert record".
- Self-review each screen with `npm run screenshots` at phone + desktop, light + dark, before calling it done.

**Next.js 16 specifics**
- `cacheComponents` is on: anything that reads cookies/headers/searchParams must render inside `<Suspense>` (with a skeleton fallback).
- Middleware is called **proxy** (`src/proxy.ts`). Read `node_modules/next/dist/docs/` before using unfamiliar APIs.

## Secrets and data

- `.env.local` only (see `.env.example`). The service-role key is for scripts, never `NEXT_PUBLIC_*`.
- Real client data (`data/*.xlsx`, `data/client_mapping.csv`) is gitignored. Demo data is made up and marked `notes = 'DEMO DATA'`.
- Business phone/address are entered in Settings, not committed.

## Decisions log

- Demo sign-in (`demo@pfesic.app` / `demo1234`, src/lib/demo/session.ts) works ONLY while Supabase env vars are absent
  (e.g. a fresh Vercel deploy). Adding the keys disables it and the proxy ignores the demo cookie. It shows made-up data only.

- Walk-in customers are `clients.kind = 'occasional'` (no monthly records), so payments and receipts work the same.
- Excel REMARK A/R is stored per month in `monthly_records.handled_by_partner_id`; NA = no work that month; D = fee due, collected later.
  Rows below TOTAL like "PF & ESIC MAY-26" are late payment of that month's charge, not new charges.
- Fresh start (owners' decision): no history imported; November 2026 is the first month worked in the app.
  ESIC codes from VENDORCODES are flagged unverified (Excel lost digits); ITC LIMITED, PS, RAJEEV KUMAR MISHRA have ₹0 charge to set.
- Split: 50/50 via dated `split_rules`. Shared expenses (ink, paper) are deducted before the split. Historical "−3400"-style lines import as `partner_transfers` with note "imported from Excel".
- Part payments get a "PART PAID / आंशिक भुगतान" seal on the receipt; full payments get "PAID / भुगतान प्राप्त".
- Fee attribution = the month's A/R handler; physical cash = received_by. Dated 50/50 split_rules; no per-partner overrides.
- Excel import: client rows' charges must equal each sheet's TOTAL row (checked); medium/low mappings need explicit approval;
  "PF & ESIC <month>" lines below TOTAL become `monthly_fee` extras on the month named; NA → no record; blank charge → ₹0 (flagged);
  Nov 26 sheet = active-client list for the current month (no records imported).
