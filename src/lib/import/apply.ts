/**
 * Excel import, step 2: write the approved mapping and the workbook into the
 * database, in ONE transaction, refusing to commit unless the totals match.
 *
 * Inputs are all reviewed by a person first:
 *   data/client_mapping.csv       every row approve = yes
 *   data/partner_adjustments.csv  from/to/kind filled (or kind = skip)
 *   data/import_decisions.json    double fees, expenses, blank charges, October dues…
 *
 * Re-running is safe: imported rows carry a unique source_ref (the Excel cell),
 * so a second run inserts nothing, and the same file + mapping can only
 * complete one batch.
 */
import { createHash } from "node:crypto";
import type { Client } from "pg";
import { addMonths, dueDateFor, type ISODate } from "@/lib/format/dates";
import type { MappingRow } from "./mapping";
import { normalizeName } from "./normalize";
import type { ParsedSheet } from "./parse-workbook";

export interface ImportDecisions {
  /** Wage months up to and including this one are treated as fully settled history. */
  settled_through: ISODate;
  /** Below-TOTAL lines not to import (e.g. the second copy of a double fee). */
  skip_refs: string[];
  /** Cell → rupees for charges left blank; anything not listed imports as ₹0. */
  blank_charges: Record<string, number>;
  /** Expense cell → partner who paid ("A", "R", or null when shared/unknown). */
  expense_paid_by: Record<string, "A" | "R" | null>;
  /** Firm name → rupees still owed for the first live month (after settled_through). Empty = none owe. */
  live_month_dues: Record<string, number>;
  /** Clients whose default challan payer is the client (everyone else defaults to "us"). */
  client_pays_challan: string[];
  /** Renames, e.g. { "PS": "P S ENTERPRISES" }. */
  rename: Record<string, string>;
}

export interface AdjustmentRow {
  ref: string;
  month: string;
  formula: string;
  amount: number;
  from_partner: string;
  to_partner: string;
  kind: string; // settlement | gov_handover | expense | skip
  note: string;
}

export interface VendorRow {
  name: string;
  pf: string | null;
  esicRaw: string | null;
}

export interface ApplyInput {
  fileName: string;
  fileHash: string;
  sheets: ParsedSheet[]; // ordered month sheets (with a TOTAL row)
  mapping: MappingRow[];
  adjustments: AdjustmentRow[];
  vendors: VendorRow[];
  decisions: ImportDecisions;
  importedBy: string;
  dryRun?: boolean;
}

export interface ImportSummary {
  batchId: string | null;
  status: "completed" | "already_imported" | "dry_run";
  before: Record<string, number>;
  after: Record<string, number>;
  months: Array<{ month: string; sheet: string; excelTotal: number; imported: number; extrasExcel: number; extrasImported: number; ok: boolean }>;
  rows: { imported: number; unchanged: number; skipped: number; needsReview: number };
  notes: string[];
}

const COUNT_TABLES = ["clients", "client_aliases", "monthly_records", "extra_charges", "expenses", "partner_transfers", "payments", "receipts"] as const;

export function mappingHash(rows: MappingRow[], adjustments: AdjustmentRow[], decisions: ImportDecisions): string {
  return createHash("sha256").update(JSON.stringify({ rows, adjustments, decisions })).digest("hex");
}

/** Problems that must be fixed in the review files before anything is written. */
export function validateInputs(input: Pick<ApplyInput, "mapping" | "adjustments" | "decisions" | "sheets">): string[] {
  const errs: string[] = [];
  const undecided = input.mapping.filter((m) => m.approve.trim().toLowerCase() !== "yes");
  if (undecided.length) errs.push(`${undecided.length} rows in client_mapping.csv still need "yes" in approve (e.g. ${undecided.slice(0, 3).map((m) => m.raw_name).join(", ")})`);
  for (const m of input.mapping) if (!["client", "walk_in", "expense", "ignore"].includes(m.kind)) errs.push(`client_mapping.csv: unknown kind "${m.kind}" for ${m.raw_name}`);
  for (const a of input.adjustments) {
    if (a.kind === "skip") continue;
    if (!["settlement", "gov_handover", "expense"].includes(a.kind)) errs.push(`partner_adjustments.csv ${a.ref}: kind must be settlement, gov_handover, expense or skip`);
    else if (a.kind !== "expense" && (!/^[AR]$/.test(a.from_partner) || !/^[AR]$/.test(a.to_partner) || a.from_partner === a.to_partner)) errs.push(`partner_adjustments.csv ${a.ref}: fill from_partner and to_partner with A or R`);
  }
  if (!/^\d{4}-\d{2}-01$/.test(input.decisions.settled_through ?? "")) errs.push("import_decisions.json: settled_through must be a month like 2026-09-01");
  return errs;
}

function clientResolver(mapping: MappingRow[], rename: Record<string, string>) {
  const bySpelling = new Map<string, MappingRow>();
  for (const m of mapping) for (const sp of m.raw_name.split(" / ")) bySpelling.set(normalizeName(sp), m);
  // `name` is the stable identity (the approved Excel name, also the source_ref key);
  // renames only change what is displayed, so renaming later never creates a second client.
  return (raw: string): { name: string; display: string; kind: MappingRow["kind"] } | null => {
    const m = bySpelling.get(normalizeName(raw));
    if (!m) return null;
    const base = (m.use_client || m.suggested_client).trim();
    return { name: base, display: rename[base] ?? base, kind: m.kind };
  };
}

/** Split an amount across months so the parts add up exactly (remainder on the first). */
export function splitPaise(total: number, parts: number): number[] {
  const each = Math.floor(total / parts);
  return Array.from({ length: parts }, (_, i) => each + (i === 0 ? total - each * parts : 0));
}

export async function applyImport(db: Client, input: ApplyInput): Promise<ImportSummary> {
  const problems = validateInputs(input);
  if (problems.length) throw new Error(`Fix these first:\n- ${problems.join("\n- ")}`);

  const { decisions } = input;
  const resolve = clientResolver(input.mapping, decisions.rename ?? {});
  const mhash = mappingHash(input.mapping, input.adjustments, decisions);
  const notes: string[] = [];
  const counts = async () => {
    const out: Record<string, number> = {};
    for (const t of COUNT_TABLES) out[t] = (await db.query(`select count(*)::int n from public.${t}`)).rows[0].n;
    return out;
  };

  const before = await counts();
  const done = await db.query(
    `select id from public.import_batches where kind='monthly_sheet' and file_hash=$1 and mapping_hash=$2 and status='completed'`,
    [input.fileHash, mhash],
  );
  if (done.rowCount) {
    return { batchId: done.rows[0].id, status: "already_imported", before, after: before, months: [], rows: { imported: 0, unchanged: 0, skipped: 0, needsReview: 0 }, notes: ["This file with this mapping was already imported. Nothing changed."] };
  }

  const partners = Object.fromEntries((await db.query(`select code, id from public.partners`)).rows.map((r) => [r.code, r.id as string]));
  const monthSheets = input.sheets.filter((s) => s.month && s.total && !s.listOnly);
  const listSheet = input.sheets.filter((s) => s.month && s.listOnly).sort((a, b) => (a.month! < b.month! ? 1 : -1))[0];
  const latestFilled = monthSheets.map((s) => s.month!).sort().at(-1)!;

  let batchId: string | null = null;
  if (!input.dryRun) {
    batchId = (await db.query(
      `insert into public.import_batches (kind, file_name, file_hash, mapping_hash, imported_by, summary_before) values ('monthly_sheet',$1,$2,$3,$4,$5) returning id`,
      [input.fileName, input.fileHash, mhash, input.importedBy, before],
    )).rows[0].id;
  }

  const log: Array<[string, unknown, string, string | null, string | null, string | null]> = [];
  const stats = { imported: 0, unchanged: 0, skipped: 0, needsReview: 0 };
  const note = (ref: string, raw: unknown, outcome: "imported" | "unchanged" | "skipped" | "needs_review" | "error", message: string | null, table: string | null = null, id: string | null = null) => {
    log.push([ref, raw, outcome, message, table, id]);
    if (outcome === "imported") stats.imported++;
    else if (outcome === "unchanged") stats.unchanged++;
    else if (outcome === "skipped") stats.skipped++;
    else if (outcome === "needs_review") stats.needsReview++;
  };

  await db.query("begin");
  try {
    // ── Clients ──────────────────────────────────────────────────────────────
    type Agg = { kind: "regular" | "occasional"; display: string; charge: number | null; partner: string | null; spellings: Set<string>; firstRef: string };
    const agg = new Map<string, Agg>();
    const touch = (name: string, kind: Agg["kind"], ref: string) => {
      const a = agg.get(name) ?? { kind, display: decisions.rename?.[name] ?? name, charge: null, partner: null, spellings: new Set<string>(), firstRef: ref };
      if (kind === "regular") a.kind = "regular";
      agg.set(name, a);
      return a;
    };
    for (const s of [...monthSheets].sort((a, b) => (a.month! < b.month! ? -1 : 1))) {
      for (const r of s.clientRows) {
        const c = resolve(r.rawName);
        if (!c || c.kind === "ignore" || c.kind === "expense") continue;
        const a = touch(c.name, c.kind === "client" ? "regular" : "occasional", r.ref);
        a.spellings.add(r.rawName.trim());
        if (r.chargePaise && r.chargePaise > 0 && !r.repeatInSheet) a.charge = r.chargePaise; // latest non-zero wins
        if (r.remark === "A" || r.remark === "R") a.partner = r.remark;
      }
      for (const e of s.extras) {
        const c = resolve(e.name);
        if (!c || c.kind === "ignore" || c.kind === "expense") continue;
        touch(c.name, c.kind === "client" ? "regular" : "occasional", e.ref).spellings.add(e.name.trim());
      }
    }
    for (const s of input.sheets.filter((x) => x.listOnly)) for (const r of s.clientRows) {
      const c = resolve(r.rawName);
      if (c && c.kind === "client") touch(c.name, "regular", r.ref).spellings.add(r.rawName.trim());
    }

    const active = new Set((listSheet ?? monthSheets.at(-1)!).clientRows.map((r) => resolve(r.rawName)?.name).filter(Boolean) as string[]);
    const vendorBy = new Map(input.vendors.map((v) => [resolve(v.name)?.name ?? normalizeName(v.name), v]));
    const clientIds = new Map<string, string>();

    for (const [name, a] of agg) {
      const v = vendorBy.get(name);
      const esic = v?.esicRaw && /^\d{17}$/.test(v.esicRaw) ? v.esicRaw : null;
      const ins = await db.query(
        `insert into public.clients (kind, firm_name, default_charge_paise, handled_by_partner_id, challan_payer_default, preferred_language,
            active, pf_establishment_code, esic_code, esic_code_verified, import_batch_id, source_ref, notes)
         values ($1,$2,$3,$4,$5,'hi',$6,$7,$8,false,$9,$10,$11)
         on conflict (source_ref) do update set firm_name = excluded.firm_name
           where public.clients.firm_name is distinct from excluded.firm_name
         returning id, (xmax = 0) as inserted`,
        [a.kind, a.display, a.charge ?? 0, a.partner ? partners[a.partner] : null,
         decisions.client_pays_challan?.includes(name) ? "client" : "us",
         a.kind === "regular" ? active.has(name) : true, v?.pf ?? null, esic, batchId, `client:${normalizeName(name)}`,
         esic ? "ESIC code from Excel lost its last digits: needs checking" : null],
      );
      const id = ins.rows[0]?.id ?? (await db.query(`select id from public.clients where source_ref=$1`, [`client:${normalizeName(name)}`])).rows[0].id;
      clientIds.set(name, id);
      note(a.firstRef, { name, kind: a.kind }, ins.rows[0]?.inserted ? "imported" : "unchanged", ins.rowCount && !ins.rows[0].inserted ? `renamed to ${a.display}` : null, "clients", id);
      for (const sp of new Set([name, a.display, ...a.spellings])) {
        await db.query(`insert into public.client_aliases (client_id, raw_name, normalized_name) values ($1,$2,$3) on conflict (normalized_name) do nothing`, [id, sp, normalizeName(sp)]);
      }
    }
    if (batchId) {
      for (const m of input.mapping) {
        const c = resolve(m.raw_name.split(" / ")[0]);
        const decision = m.kind === "client" ? "client" : m.kind === "walk_in" ? "walk_in" : "ignore";
        await db.query(
          `insert into public.client_mapping_decisions (batch_id, raw_name, normalized, decision, client_id, confidence, approved_by, approved_note)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [batchId, m.raw_name, normalizeName(m.raw_name.split(" / ")[0]), decision, decision === "ignore" ? null : clientIds.get(c!.name) ?? null, m.confidence, input.importedBy, m.notes || null],
        );
      }
    }

    // ── Months, one-off lines, expenses ──────────────────────────────────────
    const liveMonth = addMonths(decisions.settled_through, 1);
    const liveDues = new Map(Object.entries(decisions.live_month_dues ?? {}).map(([k, v]) => [resolve(k)?.name ?? k, v]));
    const monthRows: ImportSummary["months"] = [];

    for (const s of monthSheets) {
      let importedCharges = 0;
      let importedExtras = 0;
      for (const r of s.clientRows) {
        const c = resolve(r.rawName);
        if (!c || c.kind === "ignore") { note(r.ref, r, "skipped", "mapped to ignore"); continue; }
        const clientId = clientIds.get(c.name)!;
        const blank = r.chargePaise === null;
        const charge = blank ? Math.round((decisions.blank_charges?.[r.ref] ?? 0) * 100) : r.chargePaise!;
        importedCharges += charge;
        if (r.remark === "NA") { note(r.ref, r, "skipped", "NA: no work this month"); importedCharges -= charge; continue; }
        if (r.repeatInSheet) {
          // Second line for the same client in one month: an extra charge for that month.
          if (charge > 0) {
            const x = await db.query(
              `insert into public.extra_charges (client_id, wage_month, service_type, description, amount_paise, legacy_settled, import_batch_id, source_ref)
               values ($1,$2,'other','Second line in the month sheet',$3,true,$4,$5) on conflict (source_ref) do nothing returning id`,
              [clientId, s.month, charge, batchId, r.ref]);
            note(r.ref, r, x.rowCount ? "imported" : "unchanged", "repeat line → extra charge", "extra_charges", x.rows[0]?.id ?? null);
          }
          continue;
        }
        const handler = r.remark === "A" || r.remark === "R" ? partners[r.remark] : r.remark === "N" ? null : (agg.get(c.name)?.partner ? partners[agg.get(c.name)!.partner!] : null);
        const settled = s.month! <= decisions.settled_through || (s.month === liveMonth && !liveDues.has(c.name));
        const ins = await db.query(
          `insert into public.monthly_records (client_id, wage_month, charge_paise, challan_payer, due_date, handled_by_partner_id, legacy_settled, notes, import_batch_id, source_ref)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (source_ref) do nothing returning id`,
          [clientId, s.month, charge, decisions.client_pays_challan?.includes(c.name) ? "client" : "us", dueDateFor(s.month!, 15), handler, settled,
           [r.remark === "D" ? "Excel: D (fee collected later)" : null, blank ? "Excel: charge left blank" : null].filter(Boolean).join("; ") || null,
           batchId, r.ref]);
        note(r.ref, r, ins.rowCount ? "imported" : "unchanged", blank && !decisions.blank_charges?.[r.ref] ? "blank charge imported as ₹0" : null, "monthly_records", ins.rows[0]?.id ?? null);
      }

      for (const e of s.extras) {
        if (decisions.skip_refs?.includes(e.ref)) { note(e.ref, e, "skipped", "skipped by decision (double fee)"); continue; }
        const c = resolve(e.name);
        if (!c || c.kind === "ignore") { note(e.ref, e, "skipped", "mapped to ignore"); continue; }
        if (c.kind === "expense" || e.possibleExpense) {
          const paidBy = decisions.expense_paid_by?.[e.ref] ?? null;
          const x = await db.query(
            `insert into public.expenses (spent_on, month, amount_paise, description, paid_by_partner_id, import_batch_id, source_ref)
             values ($1,$1,$2,$3,$4,$5,$6) on conflict (source_ref) do nothing returning id`,
            [s.month, e.amountPaise, `${e.rawName} (imported from Excel)`, paidBy ? partners[paidBy] : null, batchId, e.ref]);
          importedExtras += e.amountPaise;
          note(e.ref, e, x.rowCount ? "imported" : "unchanged", "expense", "expenses", x.rows[0]?.id ?? null);
          continue;
        }
        const clientId = clientIds.get(c.name)!;
        const months = e.refersToMonths.length ? e.refersToMonths : [s.month!];
        const amounts = splitPaise(e.amountPaise, months.length);
        for (let i = 0; i < months.length; i++) {
          const ref = months.length > 1 ? `${e.ref}#${i + 1}` : e.ref;
          const x = await db.query(
            `insert into public.extra_charges (client_id, wage_month, service_type, description, amount_paise, handled_by_partner_id, done_on, legacy_settled, import_batch_id, source_ref)
             values ($1,$2,$3,$4,$5,$6,$7,true,$8,$9) on conflict (source_ref) do nothing returning id`,
            [clientId, months[i], e.serviceType, [e.description, `written in ${s.sheetName.trim()}`].filter(Boolean).join(" · "), amounts[i],
             e.partnerCode ? partners[e.partnerCode] : null, e.date, batchId, ref]);
          note(ref, e, x.rowCount ? "imported" : "unchanged", months.length > 1 ? `split across ${months.length} months` : null, "extra_charges", x.rows[0]?.id ?? null);
        }
        importedExtras += e.amountPaise;
      }

      for (const n of s.sideNotes.filter((x) => x.kind === "expense")) {
        const paidBy = decisions.expense_paid_by?.[n.ref] ?? null;
        const x = await db.query(
          `insert into public.expenses (spent_on, month, amount_paise, description, paid_by_partner_id, import_batch_id, source_ref)
           values ($1,$1,$2,$3,$4,$5,$6) on conflict (source_ref) do nothing returning id`,
          [s.month, n.amountPaise, `${n.label} (imported from Excel)`, paidBy ? partners[paidBy] : null, batchId, n.ref]);
        note(n.ref, n, x.rowCount ? "imported" : "unchanged", "shared expense", "expenses", x.rows[0]?.id ?? null);
      }

      const extrasExcel = s.extras.reduce((a, e) => a + e.amountPaise, 0);
      const skipped = s.extras.filter((e) => decisions.skip_refs?.includes(e.ref) || resolve(e.name)?.kind === "ignore").reduce((a, e) => a + e.amountPaise, 0);
      const naCharges = s.clientRows.filter((r) => r.remark === "NA").reduce((a, r) => a + (r.chargePaise ?? 0), 0);
      const blanksFilled = s.clientRows.filter((r) => r.chargePaise === null).reduce((a, r) => a + Math.round((decisions.blank_charges?.[r.ref] ?? 0) * 100), 0);
      // Reconcile: what we imported + what we deliberately left out must equal what the Excel says.
      const ok = importedCharges + naCharges - blanksFilled === (s.total?.valuePaise ?? 0) && importedExtras + skipped === extrasExcel;
      monthRows.push({ month: s.month!, sheet: s.sheetName.trim(), excelTotal: s.total?.valuePaise ?? 0, imported: importedCharges, extrasExcel, extrasImported: importedExtras, ok });
    }

    // ── Partner adjustments ──────────────────────────────────────────────────
    for (const a of input.adjustments) {
      if (a.kind === "skip") { note(a.ref, a, "skipped", "skipped by decision"); continue; }
      const month = `${a.month}-01`;
      if (a.kind === "expense") {
        const x = await db.query(
          `insert into public.expenses (spent_on, month, amount_paise, description, paid_by_partner_id, import_batch_id, source_ref)
           values ($1,$1,$2,$3,$4,$5,$6) on conflict (source_ref) do nothing returning id`,
          [month, Math.round(a.amount * 100), `Imported from Excel: ${a.formula}${a.note ? ` (${a.note})` : ""}`, /^[AR]$/.test(a.from_partner) ? partners[a.from_partner] : null, batchId, a.ref]);
        note(a.ref, a, x.rowCount ? "imported" : "unchanged", "adjustment as expense", "expenses", x.rows[0]?.id ?? null);
        continue;
      }
      const x = await db.query(
        `insert into public.partner_transfers (from_partner_id, to_partner_id, amount_paise, transferred_on, month, kind, note, import_batch_id, source_ref)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (source_ref) do nothing returning id`,
        [partners[a.from_partner], partners[a.to_partner], Math.round(a.amount * 100), addMonths(month, 1).slice(0, 8) + "01", month, a.kind,
         `imported from Excel: ${a.formula}${a.note ? ` (${a.note})` : ""}`, batchId, a.ref]);
      note(a.ref, a, x.rowCount ? "imported" : "unchanged", null, "partner_transfers", x.rows[0]?.id ?? null);
    }

    const mismatched = monthRows.filter((m) => !m.ok);
    if (mismatched.length) throw new Error(`Totals don't match the Excel for ${mismatched.map((m) => m.sheet).join(", ")}; nothing was imported.`);
    if (liveDues.size) notes.push(`${liveMonth.slice(0, 7)} left open for: ${[...liveDues.keys()].join(", ")}`);
    else notes.push(`Everything through ${latestFilled.slice(0, 7)} imported as settled history (no October dues given).`);

    if (batchId) {
      for (const [ref, raw, outcome, message, table, id] of log) {
        await db.query(
          `insert into public.import_row_log (batch_id, source_ref, raw, outcome, message, target_table, target_id) values ($1,$2,$3,$4,$5,$6,$7)`,
          [batchId, ref, JSON.stringify(raw), outcome, message, table, id]);
      }
    }
    const after = await counts();
    if (input.dryRun) {
      await db.query("rollback");
      return { batchId: null, status: "dry_run", before, after, months: monthRows, rows: stats, notes };
    }
    await db.query(
      `update public.import_batches set status='completed', completed_at=now(), total_rows=$2, successful_rows=$3, skipped_rows=$4, failed_rows=0,
         reconciliation_status='matched', summary_after=$5 where id=$1`,
      [batchId, log.length, stats.imported + stats.unchanged, stats.skipped, { counts: after, months: monthRows }]);
    await db.query("commit");
    return { batchId, status: "completed", before, after, months: monthRows, rows: stats, notes };
  } catch (e) {
    await db.query("rollback");
    if (batchId) await db.query(`update public.import_batches set status='failed', error=$2, completed_at=now() where id=$1`, [batchId, (e as Error).message]);
    throw e;
  }
}
