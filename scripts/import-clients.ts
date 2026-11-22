/**
 * Fresh start: import ONLY the current client list (no past months, payments or adjustments).
 *
 *   npm run import:clients -- --dry-run     # show what would be imported
 *   npm run import:clients                  # write to Supabase
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (server-side key; never commit it).
 * Safe to re-run: clients are keyed by source_ref and aliases by spelling, so nothing duplicates.
 * The Excel files are only read.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { buildFreshClients, type VendorCode } from "../src/lib/import/clients-only";
import { cellOf, readWorkbook } from "../src/lib/import/excel-grid";
import { normalizeName } from "../src/lib/import/normalize";
import { formatINR } from "../src/lib/format/money";

const FILE = "data/Contractor_PF_ESIC_Amount.xlsx";
const VENDORS = "data/VENDORCODES.xlsx";
const MAPPING = "clients-only-v1";

async function readVendors(): Promise<VendorCode[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(VENDORS);
  const out: VendorCode[] = [];
  wb.worksheets[0].eachRow((row, r) => {
    if (r === 1) return;
    const name = cellOf(row.getCell(2)).v;
    if (typeof name !== "string" || !name.trim()) return;
    const pf = cellOf(row.getCell(3)).v;
    const esic = cellOf(row.getCell(4)).v;
    out.push({
      name: name.trim(),
      pf: typeof pf === "string" ? pf.trim() : null,
      esicRaw: typeof esic === "number" ? BigInt(Math.round(esic)).toString() : typeof esic === "string" ? esic.trim() : null,
    });
  });
  return out;
}

function api() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
  return async (path: string, init: RequestInit & { prefer?: string } = {}) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, "Content-Type": "application/json", ...(init.prefer ? { Prefer: init.prefer } : {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}): ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sheets = await readWorkbook(FILE);
  const clients = buildFreshClients(sheets.filter((s) => s.total || s.listOnly), await readVendors());

  console.log(`${clients.length} clients from the newest sheet (no history imported)\n`);
  for (const c of clients) {
    console.log(`${c.name.padEnd(30)} ${formatINR(c.chargePaise).padStart(7)}  ${c.partner ?? "N"}  ${c.notes.filter((n) => !n.startsWith("ESIC")).join("; ")}`);
  }
  console.log(`\nService charges per month: ${formatINR(clients.reduce((a, c) => a + c.chargePaise, 0))}`);
  if (dryRun) return console.log("\nDry run: nothing saved.");

  const rest = api();
  const fileHash = createHash("sha256").update(readFileSync(FILE)).digest("hex");
  const partners: Record<string, string> = Object.fromEntries((await rest("partners?select=code,id")).map((p: { code: string; id: string }) => [p.code, p.id]));
  const before = (await rest("clients?select=id")).length;

  const done = await rest(`import_batches?select=id&status=eq.completed&file_hash=eq.${fileHash}&mapping_hash=eq.${MAPPING}`);
  const [batch] = done.length
    ? done
    : await rest("import_batches", {
        method: "POST", prefer: "return=representation",
        body: JSON.stringify({ kind: "monthly_sheet", file_name: FILE.split("/").pop(), file_hash: fileHash, mapping_hash: MAPPING, imported_by: process.env.IMPORTED_BY ?? "import-clients script", total_rows: clients.length }),
      });

  await rest("clients?on_conflict=source_ref", {
    method: "POST", prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify(clients.map((c) => ({
      kind: "regular", firm_name: c.name, default_charge_paise: c.chargePaise,
      handled_by_partner_id: c.partner ? partners[c.partner] : null, challan_payer_default: "us", preferred_language: "hi", active: true,
      pf_establishment_code: c.pfCode, esic_code: c.esicCode, esic_code_verified: false,
      notes: c.notes.join("; ") || null, import_batch_id: batch.id, source_ref: c.sourceRef,
    }))),
  });
  const ids: Record<string, string> = Object.fromEntries(
    (await rest(`clients?select=id,source_ref&source_ref=in.(${clients.map((c) => `"${c.sourceRef}"`).join(",")})`)).map((r: { id: string; source_ref: string }) => [r.source_ref, r.id]),
  );
  const aliases = clients.flatMap((c) => [...new Map(c.aliases.map((a) => [normalizeName(a), a])).entries()].map(([n, raw]) => ({ client_id: ids[c.sourceRef], raw_name: raw, normalized_name: n })));
  await rest("client_aliases?on_conflict=normalized_name", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", body: JSON.stringify(aliases) });

  const after = (await rest("clients?select=id")).length;
  if (!done.length) {
    await rest(`import_batches?id=eq.${batch.id}`, {
      method: "PATCH", prefer: "return=minimal",
      body: JSON.stringify({ status: "completed", completed_at: new Date().toISOString(), successful_rows: after - before, skipped_rows: clients.length - (after - before), reconciliation_status: "matched", summary_before: { clients: before }, summary_after: { clients: after, mode: "clients only, fresh start" } }),
    });
  }
  console.log(`\nClients in the database: before ${before}, after ${after} (${after - before} added, ${clients.length - (after - before)} already there)`);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
