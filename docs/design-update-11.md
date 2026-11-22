# Design update — Section 11 (as modified by the owners)

Phase 0 stays as built. These are additions on top, in new migrations.

Also adopted: business address **Munger, Bihar / मुंगेर, बिहार**, phone **94304 49312**. Primary target is **desktop**
(sidebar, wide tables, keyboard), with phones fully supported.

## 1. Schema changes

| Change | Why |
|---|---|
| `challan_transactions` (new): monthly_record_id, challan_type pf/esic, challan_number, trrn, amount_paise, paid_on, paid_by us/client, paid_by_partner_id, evidence_file_path, verified_by, verified_at, voided + void_reason, replaces_id, notes | One active challan per type per month (partial unique index). Corrections void + replace. VERIFIED requires evidence + a partner's confirmation (DB check). |
| Drop challan columns from `monthly_records` | `challan_transactions` is the single source |
| `import_batches`, `import_row_log`, `client_mapping_decisions` (new) | Batch tracking, duplicate-file detection (unique sha256), row-level log, mapping approval history |
| `import_batch_id` + unique `source_ref` (e.g. `SEPT26!B45`) on imported rows | Traceable, idempotent re-runs |
| `payment_allocations.component` → pf / esic / charge / extra | Government money and fees separate from the start |
| `partner_transfers.kind` → settlement / gov_handover | Gov cash handovers never mix with fee settlement |
| `message_log.status` prepared / shared (manual); delivered / read only for the API channel | No false "delivered" |
| `financial_ledger` is a **view** over payments, allocations, challan_transactions, expenses, partner_transfers | One authoritative source per event; voids appear as reversal rows |

## 2. Money rules

- Due(month) = (payer us ? PF + ESIC : 0) + charge + extras.
- Payment split: oldest month first (overridable); within a month PF → ESIC → charge → extras.
- Advance = payment − applied. Applied only on the next payment or "Use advance"; never silently.
- Client owes = Σ due − Σ applied. Advance shown separately.
- Government money with partner P = PF + ESIC received by P − challans deposited by P ± gov handovers.
- Earned = charge + extras collected (cash basis, like the Excel). Attributed to the month's A/R handler; N → shared pool.
- Settlement for a period: pool = fees collected − shared expenses; share = pool × dated split (50/50);
  partner fee cash = fees received by P − expenses paid by P; owed between partners = fee cash − share ± settlement transfers.
- Mismatch flags: gov collected ≠ deposited + held; challan amount ≠ portal amount; payment without exactly one valid
  receipt; receipt-number gap; import totals ≠ Excel TOTAL. Never auto-adjusted.

## 3. Transaction boundaries (one Postgres function each, Zod-validated first, client row locked)

1. Record payment: idempotency check → dues → payment + splits + advance → receipt number → receipt.
2. Void payment (+ its receipt). 3. Reissue receipt (void + new number). 4. Use advance.
5. Record / correct challan (void + replace). 6. Verify challan (needs evidence). 7. Start month (no duplicates).
8. Apply import batch (all-or-nothing; refused on total mismatch).

PF/ESIC edits after a receipt: allowed and audited; excess paid becomes advance; receipt flagged "needs reissue".

## 4. Status rules (computed in a view)

- Amounts: ENTERED when PF and ESIC both filled (0 = nil).
- Notification: NOTIFIED when a dues / challan-ready message was shared.
- Payment: UNPAID / PART_PAID / PAID per month; CREDIT at client level when advance > 0.
- Challan, per type: NOT_REQUIRED (amount 0) · PENDING · PAID · VERIFIED; month = worse of PF and ESIC.
- Receipt: NOT_ISSUED / ISSUED / VOIDED.
- Overdue: today > due date and (not PAID or a challan not PAID).
- Overall chip priority: Amounts not entered → Overdue → Not notified → Payment pending / Part paid → Challan pending →
  Proof pending → Done (paid + challans verified/not required + receipt shared). Imported history ≤ Sep 2026 = Done.

UI words: Received, Deposited, Government money with Rajeev, Earned, Owes, Advance — never ledger/debit/credit/allocation.

## 5. Phase 3 backlog

Standalone reports from 11.13 (ageing, advance, monthly revenue, partner-wise collections and earnings, gov held vs
deposited — their numbers already appear in Reconciliation tabs); refunds; WhatsApp delivered/read (API only).
Dropped: settlement_owner_partner_id and partner-specific split overrides.

Phase 2 keeps: Reconciliation screen (tabs client / partner / month / PF / ESIC / payment mode + mismatch indicator),
receipt register + voided register, Client 360, settlement screen, Today's Queue categories.
