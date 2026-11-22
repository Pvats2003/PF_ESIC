/**
 * Excel import, step 1 of 2: read the workbook, suggest client mapping, STOP.
 *
 *   npx tsx scripts/import-excel.ts map
 *     [--file=data/Contractor_PF_ESIC_Amount.xlsx] [--vendors=data/VENDORCODES.xlsx]
 *
 * Writes (all gitignored, the Excel files are only read, never modified):
 *   data/client_mapping.csv       one row per raw spelling → suggested client (review this)
 *   data/partner_adjustments.csv  the "−3400"-style settlement lines (fill in who paid whom)
 *   data/import_preview.md        month-by-month totals vs the Excel TOTAL rows, and everything flagged
 *
 *   data/import_decisions.json    the open questions (double fees, expenses, blank charges, October dues…)
 *
 * Step 2, once those are filled in:
 *   DATABASE_URL=… npx tsx scripts/import-excel.ts apply [--dry-run]
 * Runs in one transaction and refuses to commit unless every month matches the Excel totals.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { formatINR } from "../src/lib/format/money";
import { formatMonth } from "../src/lib/format/dates";
import { collectOccurrences, suggestMapping, toCsv, type MappingRow } from "../src/lib/import/mapping";
import { normalizeName } from "../src/lib/import/normalize";
import { Client } from "pg";
import { applyImport, type AdjustmentRow, type ImportDecisions } from "../src/lib/import/apply";
import { cellOf, readWorkbook } from "../src/lib/import/excel-grid";
import { orderSheets, type ParsedSheet } from "../src/lib/import/parse-workbook";

const arg = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const FILE = arg("file", "data/Contractor_PF_ESIC_Amount.xlsx");
const VENDORS = arg("vendors", "data/VENDORCODES.xlsx");
const OUT = arg("out", "data");

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const inr = (p: number | null | undefined) => (p === null || p === undefined ? "—" : formatINR(p));

async function readVendors(path: string) {
  if (!existsSync(path)) return [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  const out: Array<{ name: string; pf: string | null; esicRaw: string | null; ref: string }> = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const name = cellOf(row.getCell(2)).v;
    if (typeof name !== "string" || !name.trim()) return;
    const pf = cellOf(row.getCell(3)).v;
    const esic = cellOf(row.getCell(4)).v;
    out.push({
      name: name.trim(),
      pf: typeof pf === "string" ? pf.trim() : null,
      // Excel stored these 17-digit codes as numbers, so the last digits are already lost.
      esicRaw: typeof esic === "number" ? BigInt(Math.round(esic)).toString() : typeof esic === "string" ? esic.trim() : null,
      ref: `VENDORCODES!B${r}`,
    });
  });
  return out;
}

async function main() {
  const mode = process.argv[2];
  if (mode === "apply") return apply();
  if (mode !== "map") {
    console.error("Usage: npx tsx scripts/import-excel.ts map | apply [--dry-run]");
    process.exit(1);
  }
  if (!existsSync(FILE)) throw new Error(`Put the workbook at ${FILE} (it stays untouched)`);

  const sheets = await readWorkbook(FILE);
  const vendors = await readVendors(VENDORS);

  // Sheet1 (July 2025) is a name list only; the newest sheet may be an unfilled list for the current month.
  const monthSheets = sheets.filter((s) => s.total);
  const { ordered, warnings: orderWarnings } = orderSheets(monthSheets);
  const listSheets = sheets.filter((s) => !s.total);

  const occ = collectOccurrences([...listSheets, ...ordered], vendors.map((v) => v.name));
  const mapping = suggestMapping(occ);

  // Never overwrite a mapping someone may already be editing.
  const mappingPath = `${OUT}/client_mapping.csv`;
  const target = existsSync(mappingPath) ? `${OUT}/client_mapping.new.csv` : mappingPath;
  writeFileSync(target, toCsv(mapping));

  const adjustments = ordered.concat(listSheets).flatMap((s) => s.sideNotes.filter((n) => n.kind === "adjustment").map((n) => ({ ...n, sheet: s.sheetName.trim(), month: s.month })));
  writeFileSync(
    `${OUT}/partner_adjustments.csv`,
    "ref,month,formula,amount,from_partner,to_partner,kind,note\n" +
      adjustments.map((a) => [a.ref, a.month?.slice(0, 7) ?? "", `"${a.label}"`, a.amountPaise / 100, "", "", "", ""].join(",")).join("\n") + "\n",
  );

  writeFileSync(`${OUT}/import_preview.md`, preview(ordered, listSheets, mapping, vendors, adjustments, orderWarnings));
  if (!existsSync(`${OUT}/import_decisions.json`)) writeFileSync(`${OUT}/import_decisions.json`, decisionsTemplate(ordered));

  // Console summary
  const clients = new Set(mapping.filter((m) => m.kind === "client").map((m) => m.suggested_client));
  const walkIns = new Set(mapping.filter((m) => m.kind === "walk_in").map((m) => m.suggested_client));
  console.log(`File            ${FILE}  sha256 ${sha256(FILE).slice(0, 16)}…`);
  console.log(`Months          ${ordered.map((s) => s.month!.slice(0, 7)).join(", ")}`);
  console.log(`Raw spellings   ${mapping.length}  →  ${clients.size} suggested clients, ${walkIns.size} walk-ins, ${mapping.filter((m) => m.kind === "expense").length} possible expenses`);
  console.log(`Needs approval  ${mapping.filter((m) => m.approve !== "yes").length} rows (medium/low confidence)`);
  console.log("");
  console.log("Month       Client charges   Excel TOTAL   Check");
  for (const s of ordered) {
    const sum = s.clientRows.reduce((a, r) => a + (r.chargePaise ?? 0), 0);
    const ok = s.listOnly ? "not filled yet" : (s.total?.valuePaise ?? 0) === sum ? "✓" : "✗ MISMATCH";
    console.log(`${s.month!.slice(0, 7)}     ${inr(sum).padStart(13)}   ${inr(s.total?.valuePaise).padStart(11)}   ${ok}`);
  }
  console.log(`\nWrote ${target}, ${OUT}/partner_adjustments.csv, ${OUT}/import_preview.md`);
  console.log("Stopped here: review the CSVs, then run step 2 (apply).");
}

function decisionsTemplate(ordered: ParsedSheet[]): string {
  const fees = ordered.flatMap((s) => s.extras.filter((e) => e.serviceType === "monthly_fee" || /CHALLAN/i.test(e.description ?? "")).map((e) => `${e.ref}: ${e.name} ₹${e.amountPaise / 100}`));
  const t = {
    _help: "Fill this in, then run: npm run import:apply -- --dry-run. Keys starting with _ are notes and are ignored.",
    settled_through: "2026-09-01",
    _settled_through: "Months up to this one import as fully paid history. The next month (October 2026) is live only for clients listed in live_month_dues.",
    live_month_dues: {} as Record<string, number>,
    _live_month_dues: "October 2026 dues still outstanding, e.g. { \"KAMLI SAH\": 500 }. Leave {} for none.",
    skip_refs: [] as string[],
    _skip_refs_candidates: fees,
    _skip_refs: "Cells of below-TOTAL lines NOT to import, e.g. the second copy of a double fee: [\"MAR26!B44\"].",
    blank_charges: Object.fromEntries(ordered.flatMap((s) => s.listOnly ? [] : s.clientRows.filter((r) => r.chargePaise === null).map((r) => [r.ref, null]))),
    _blank_charges: "Rupees for each blank charge cell; null imports as ₹0.",
    expense_paid_by: Object.fromEntries(ordered.flatMap((s) => [...s.sideNotes.filter((n) => n.kind === "expense").map((n) => [n.ref, null]), ...s.extras.filter((e) => e.possibleExpense).map((e) => [e.ref, null])])),
    _expense_paid_by: "Who paid each expense: \"A\", \"R\" or null (shared / not known).",
    client_pays_challan: [] as string[],
    _client_pays_challan: "Clients who normally pay their own challan (default for everyone else: we pay).",
    rename: {} as Record<string, string>,
    _rename: "Optional nicer names, e.g. { \"PRADEEEP ENTERPRISES\": \"PRADEEP ENTERPRISES\", \"PS\": \"…\" }.",
  };
  return JSON.stringify(t, null, 2) + "\n";
}

/** Minimal CSV reader for the files this script writes (quoted fields, doubled quotes). */
export function readCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

async function apply() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL to the database to import into");
  for (const f of [FILE, `${OUT}/client_mapping.csv`, `${OUT}/partner_adjustments.csv`, `${OUT}/import_decisions.json`]) {
    if (!existsSync(f)) throw new Error(`Missing ${f}. Run the map step first.`);
  }
  const sheets = await readWorkbook(FILE);
  const vendors = await readVendors(VENDORS);
  const mapping = readCsv(readFileSync(`${OUT}/client_mapping.csv`, "utf8")) as unknown as MappingRow[];
  const adjustments = readCsv(readFileSync(`${OUT}/partner_adjustments.csv`, "utf8")).map((r) => ({ ...r, amount: Number(r.amount) })) as unknown as AdjustmentRow[];
  const raw = JSON.parse(readFileSync(`${OUT}/import_decisions.json`, "utf8")) as Record<string, unknown>;
  const decisions = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("_"))) as unknown as ImportDecisions;

  // Every spelling in the workbook must be in the reviewed mapping.
  const fresh = suggestMapping(collectOccurrences(sheets, vendors.map((v) => v.name)));
  const known = new Set(mapping.flatMap((m) => m.raw_name.split(" / ").map((x) => normalizeName(x))));
  const unknown = fresh.filter((m) => m.raw_name.split(" / ").some((x) => !known.has(normalizeName(x))));
  if (unknown.length) throw new Error(`The workbook has spellings not in client_mapping.csv (${unknown.map((u) => u.raw_name).join(", ")}). Run map again and review.`);

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const r = await applyImport(db, {
      fileName: FILE.split("/").pop()!, fileHash: sha256(FILE), sheets: sheets.filter((s) => s.total || s.listOnly),
      mapping, adjustments, vendors, decisions, importedBy: process.env.IMPORTED_BY ?? process.env.USER ?? "import script", dryRun,
    });
    printSummary(r);
  } finally {
    await db.end();
  }
}

function printSummary(r: Awaited<ReturnType<typeof applyImport>>) {
  console.log(r.status === "dry_run" ? "DRY RUN: nothing was saved\n" : r.status === "already_imported" ? "Already imported: nothing changed\n" : `Imported (batch ${r.batchId})\n`);
  console.log("Table               Before   After");
  for (const k of Object.keys(r.before)) console.log(`${k.padEnd(18)} ${String(r.before[k]).padStart(7)} ${String(r.after[k]).padStart(7)}`);
  if (r.months.length) {
    console.log("\nMonth     Excel TOTAL   Imported   Below-TOTAL Excel   Imported   Check");
    for (const m of r.months) console.log(`${m.month.slice(0, 7)}   ${inr(m.excelTotal).padStart(11)} ${inr(m.imported).padStart(10)}   ${inr(m.extrasExcel).padStart(17)} ${inr(m.extrasImported).padStart(10)}   ${m.ok ? "✓" : "✗"}`);
  }
  console.log(`\nRows: ${r.rows.imported} imported, ${r.rows.unchanged} already there, ${r.rows.skipped} skipped`);
  for (const n of r.notes) console.log(`• ${n}`);
}

function preview(
  ordered: ParsedSheet[],
  lists: ParsedSheet[],
  mapping: ReturnType<typeof suggestMapping>,
  vendors: Awaited<ReturnType<typeof readVendors>>,
  adjustments: Array<{ ref: string; label: string; amountPaise: number; month: string | null }>,
  orderWarnings: string[],
): string {
  const L: string[] = [];
  const nameOf = new Map<string, string>();
  for (const m of mapping) for (const sp of m.raw_name.split(" / ")) nameOf.set(normalizeName(sp), m.suggested_client || sp);
  const client = (raw: string) => nameOf.get(normalizeName(raw)) ?? raw.trim();

  L.push("# Import preview (nothing has been imported yet)", "");
  L.push(`Workbook: \`${FILE}\` · sha256 \`${sha256(FILE)}\``, "");
  L.push("## 1. Totals per month: client charges vs the Excel TOTAL row", "");
  L.push("| Sheet | Wage month | Clients | Client charges | Excel TOTAL | ✓ | Below-TOTAL lines | Their sum | Excel subtotal |", "|---|---|---:|---:|---:|:-:|---:|---:|---:|");
  for (const s of ordered) {
    const sum = s.clientRows.reduce((a, r) => a + (r.chargePaise ?? 0), 0);
    const xs = s.extras.reduce((a, e) => a + e.amountPaise, 0);
    const ok = s.listOnly ? "not filled yet" : (s.total?.valuePaise ?? 0) === sum ? "✓" : "✗";
    const sub = s.extrasSubtotal ? inr(s.extrasSubtotal.valuePaise) : "—";
    const subOk = !s.extrasSubtotal || (s.extrasSubtotal.valuePaise ?? 0) === xs;
    L.push(`| ${s.sheetName.trim()} | ${formatMonth(s.month!)} | ${s.clientRows.length} | ${inr(sum)} | ${inr(s.total?.valuePaise)} | ${ok} | ${s.extras.length} | ${inr(xs)} | ${sub}${subOk ? "" : " ✗"} |`);
  }
  for (const s of lists) L.push("", `Name list only (no amounts): **${s.sheetName}** (${s.month ? formatMonth(s.month) : "?"}), used for spellings, not imported as a month.`);

  const warn = [...orderWarnings, ...ordered.flatMap((s) => s.warnings.map((w) => `${s.sheetName.trim()}: ${w}`))];
  if (warn.length) L.push("", "**Sheet warnings**", "", ...warn.map((w) => `- ${w}`));

  L.push("", "## 2. Things that need your decision", "");
  const d = ordered.flatMap((s) => s.clientRows.filter((r) => r.remark === "D").map((r) => ({ s, r })));
  L.push(`### 2a. "D" rows (fee due, collected later): ${d.length}`, "", "Imported with the charge written (often ₹0). The fee collected later is imported from the line below TOTAL that names the month (see 2c).", "");
  for (const { s, r } of d) L.push(`- ${formatMonth(s.month!)}: **${client(r.rawName)}** charge ${inr(r.chargePaise)} (${r.ref})`);

  const na = ordered.flatMap((s) => s.clientRows.filter((r) => r.remark === "NA").map((r) => ({ s, r })));
  L.push("", `### 2b. "NA" rows (no work that month): ${na.length}`, "", "No month record is created for these.", "");
  L.push(na.map(({ s, r }) => `${client(r.rawName)} (${s.month!.slice(0, 7)})`).join(" · "));

  const fees = ordered.flatMap((s) => s.extras.filter((e) => e.serviceType === "monthly_fee" || /PF.*ESIC.*CHALLAN|PF ESIC CHALLAN/i.test(e.description ?? "")).map((e) => ({ s, e })));
  L.push("", `### 2c. Monthly fees written below TOTAL: ${fees.length}`, "", "Imported as that client's fee for the month named. ⚠ = possible double: that month already has a fee for the client in its own sheet or in another line here. Please check each ⚠.", "");
  const chargeIn = new Map<string, number>();
  for (const s of ordered) for (const r of s.clientRows) chargeIn.set(`${client(r.rawName)}|${s.month}`, (chargeIn.get(`${client(r.rawName)}|${s.month}`) ?? 0) + (r.chargePaise ?? 0));
  const feeLines = new Map<string, string[]>();
  for (const { s, e } of fees) for (const m of e.refersToMonths.length ? e.refersToMonths : [s.month!]) {
    const k = `${client(e.name)}|${m}`;
    feeLines.set(k, [...(feeLines.get(k) ?? []), e.ref]);
  }
  for (const { s, e } of fees) {
    const months = e.refersToMonths.length ? e.refersToMonths : [s.month!];
    const dbl = months.some((m) => (chargeIn.get(`${client(e.name)}|${m}`) ?? 0) > 0 || (feeLines.get(`${client(e.name)}|${m}`)?.length ?? 0) > 1);
    L.push(`- ${e.ref}: **${client(e.name)}** ${inr(e.amountPaise)} for ${months.map((m) => formatMonth(m)).join(" + ")}${e.refersToMonths.length ? "" : " (no month written: sheet's own month assumed)"}${dbl ? " ⚠" : ""}`);
  }

  const blanks = ordered.flatMap((s) => s.listOnly ? [] : s.clientRows.filter((r) => r.chargePaise === null).map((r) => ({ s, r })));
  L.push("", `### 2d. Charge left blank: ${blanks.length}`, "", "Imported as ₹0 (nothing charged) unless you tell me the amount.", "");
  for (const { s, r } of blanks) L.push(`- ${formatMonth(s.month!)}: **${client(r.rawName)}** (${r.ref})`);

  const repeats = ordered.flatMap((s) => s.clientRows.filter((r) => r.repeatInSheet).map((r) => ({ s, r })));
  if (repeats.length) {
    L.push("", `### 2e. Same client twice in one month's client rows: ${repeats.length}`, "", "The second line is imported as an extra charge for that month.", "");
    for (const { s, r } of repeats) L.push(`- ${formatMonth(s.month!)}: **${client(r.rawName)}** ${inr(r.chargePaise)} (${r.ref})`);
  }

  const expenses = ordered.flatMap((s) => [
    ...s.sideNotes.filter((n) => n.kind === "expense").map((n) => `- ${formatMonth(s.month!)}: ${n.label} ${inr(n.amountPaise)} (${n.ref}), shared expense`),
    ...s.extras.filter((e) => e.possibleExpense).map((e) => `- ${formatMonth(s.month!)}: "${e.rawName}" ${inr(e.amountPaise)} (${e.ref}), looks like a purchase; expense or client?`),
  ]);
  L.push("", `### 2f. Expenses: ${expenses.length}`, "", "Shared expenses come off before the 50/50 split. Who paid for each?", "", ...expenses);

  L.push("", `### 2g. Partner adjustments: ${adjustments.length}`, "", "Lines like `=F43-3400` under the split. They become partner transfers (note \"imported from Excel\"), but the sheet doesn't say who paid whom. Fill `from_partner` / `to_partner` (A or R) and `kind` (settlement, or expense if it was a cost) in `data/partner_adjustments.csv`.", "");
  for (const a of adjustments) L.push(`- ${a.month ? formatMonth(a.month) : "?"}: \`${a.label}\` → ${inr(a.amountPaise)} (${a.ref})`);

  L.push("", "## 3. PF and ESIC codes (VENDORCODES.xlsx)", "");
  L.push("PF codes import as written. **ESIC codes were stored by Excel as numbers and have lost their last digits**, so they import flagged \"needs checking\" until you send the correct ones.", "");
  L.push("| Firm | PF code | ESIC (as Excel kept it) |", "|---|---|---|");
  for (const v of vendors) L.push(`| ${client(v.name)} | ${v.pf ?? "—"} | ${v.esicRaw ?? "—"} ⚠ |`);

  L.push("", "## 4. Client mapping summary", "");
  const regular = [...new Set(mapping.filter((m) => m.kind === "client").map((m) => m.suggested_client))];
  L.push(`${mapping.length} raw spellings → **${regular.length} clients**, ${new Set(mapping.filter((m) => m.kind === "walk_in").map((m) => m.suggested_client)).size} walk-ins, ${mapping.filter((m) => m.kind === "expense").length} possible expenses.`, "");
  L.push(`Rows needing your approval (medium/low): **${mapping.filter((m) => m.approve !== "yes").length}**. High-confidence rows are pre-approved; you can still change them.`, "");
  L.push("How to fill `data/client_mapping.csv`:", "", "- `approve`: write `yes` to accept the suggestion.", "- `use_client`: write a different client name to map this spelling there instead (and `yes` in approve).", "- `kind`: change to `client`, `walk_in`, `expense` or `ignore` if the suggestion is wrong.", "- Leave nothing blank in `approve`: the import refuses to run until every row is decided.", "");
  return L.join("\n") + "\n";
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
