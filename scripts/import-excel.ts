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
 * Step 2 (`apply`) imports into the database once the CSVs are approved. It is built after review.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { formatINR } from "../src/lib/format/money";
import { formatMonth } from "../src/lib/format/dates";
import { collectOccurrences, suggestMapping, toCsv } from "../src/lib/import/mapping";
import { normalizeName } from "../src/lib/import/normalize";
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
  if (mode !== "map") {
    console.error("Usage: npx tsx scripts/import-excel.ts map   (step 2, `apply`, comes after the mapping is approved)");
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
