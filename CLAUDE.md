# PF ESIC Desk

Client, collection and receipt manager for a two-partner PF/ESIC consultancy in Bihar (Alok = `A`, Rajeev Kumar Mishra = `R`).
Replaces a monthly Excel sheet plus handwritten notes. Mobile-first PWA; the partners mostly use Android phones.

@AGENTS.md

## Status

- **Phase 0 (setup): done.** Schema + RLS, auth (allow-list, no sign-up), design tokens, `/design` style guide, receipt component, PWA shell, CI.
- **Phase 1 (Excel import): next.** `scripts/import-excel.ts` → `data/client_mapping.csv` → review → import.
- Phase 2 (core app) and Phase 3 (automation) follow; see the brief.

## Commands

| What | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Everything CI runs (lint, types, unit, DB) | `npm run check` |
| Unit tests (money, words, dates, phones, contrast) | `npm test` |
| DB tests: migrations, RLS, receipt numbering (needs Postgres, not Supabase) | `npm run test:db` |
| End-to-end smoke (builds, starts on :3200) | `npm run test:e2e` |
| Design screenshots 390×844 + 1440×900, light + dark | `npm run screenshots -- /design docs/screenshots --full` (dev server on :3100, or set `BASE_URL`) |
| Add / remove a partner login | `npm run user:add -- email@x.com A` · `npm run user:add -- email@x.com --remove` |
| Demo data (refuses if real clients exist) | `npm run db:seed-demo` |
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
src/lib/demo/            deterministic made-up demo data
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

- Walk-in customers are `clients.kind = 'occasional'` (no monthly records), so payments and receipts work the same.
- Excel REMARK A/R is stored per month in `monthly_records.handled_by_partner_id`; NA = no work that month; D = fee due, collected later.
  Rows below TOTAL like "PF & ESIC MAY-26" are late payment of that month's charge, not new charges.
- History up to Sep 2026 imports as `legacy_settled` (no receipts). October 2026 onward is live.
- Split: 50/50 via dated `split_rules`. Shared expenses (ink, paper) are deducted before the split. Historical "−3400"-style lines import as `partner_transfers` with note "imported from Excel".
- Part payments get a "PART PAID / आंशिक भुगतान" seal on the receipt; full payments get "PAID / भुगतान प्राप्त".
