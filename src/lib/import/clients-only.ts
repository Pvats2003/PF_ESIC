/**
 * Fresh-start import: clients only, no history.
 *
 * The owners chose to start afresh, so no past months, one-off charges,
 * payments, expenses or partner adjustments are imported. From the workbook we
 * take just the master data for the clients on the newest sheet:
 *   firm name, latest non-zero service charge, partner (latest A/R/N remark),
 *   PF/ESIC codes (from VENDORCODES), and every old spelling as a search alias.
 */
import { compactKey, isGenericTailVariant, isTypoVariant, normalizeName } from "./normalize";
import type { ParsedSheet } from "./parse-workbook";

export interface FreshClient {
  name: string; // display name (canonical spelling)
  sourceRef: string; // client:<NAME>, stable across re-runs
  chargePaise: number;
  chargeFrom: string | null; // sheet the charge came from, null = none found
  partner: "A" | "R" | null; // null = N / unknown
  pfCode: string | null;
  esicCode: string | null; // 17 digits as Excel kept them; always unverified
  aliases: string[];
  notes: string[];
}

export interface VendorCode {
  name: string;
  pf: string | null;
  esicRaw: string | null;
}

const same = (a: string, b: string) => compactKey(a) === compactKey(b);
const similar = (a: string, b: string) => same(a, b) || isTypoVariant(a, b) || isGenericTailVariant(a, b);

export function buildFreshClients(sheets: ParsedSheet[], vendors: VendorCode[]): FreshClient[] {
  const dated = sheets.filter((s) => s.month).sort((a, b) => (a.month! < b.month! ? -1 : 1));
  const current = dated.at(-1);
  if (!current) throw new Error("No dated sheet found in the workbook");
  const history = dated.filter((s) => !s.listOnly);

  const out: FreshClient[] = [];
  for (const row of current.clientRows) {
    if (row.repeatInSheet) continue;
    const name = normalizeName(row.rawName);
    const notes: string[] = [];

    // Every earlier client row for this client, newest last. Exact (after clean-up) or typo-close spellings only.
    const past = history.flatMap((s) => s.clientRows.filter((r) => !r.repeatInSheet && similar(r.rawName, row.rawName)).map((r) => ({ s, r })));
    const withCharge = past.filter(({ r }) => r.chargePaise !== null && r.chargePaise > 0);
    const last = withCharge.at(-1);
    const remark = [...past].reverse().find(({ r }) => r.remark === "A" || r.remark === "R" || r.remark === "N");

    if (!past.length) notes.push(`new on the ${current.sheetName.trim()} list: set the service charge`);
    else if (!last) notes.push("no service charge in any sheet (₹0)");

    const vendor = vendors.find((v) => same(v.name, row.rawName)) ?? vendors.find((v) => similar(v.name, row.rawName));
    const esic = vendor?.esicRaw && /^\d{17}$/.test(vendor.esicRaw) ? vendor.esicRaw : null;
    if (esic) notes.push("ESIC code from Excel lost its last digits: needs checking");

    const aliases = new Set<string>([row.rawName.trim()]);
    for (const { r } of past) aliases.add(r.rawName.trim());
    if (vendor) aliases.add(vendor.name.trim());

    out.push({
      name,
      sourceRef: `client:${name}`,
      chargePaise: last?.r.chargePaise ?? 0,
      chargeFrom: last ? last.s.sheetName.trim() : null,
      partner: remark?.r.remark === "A" || remark?.r.remark === "R" ? remark.r.remark : null,
      pfCode: vendor?.pf ?? null,
      esicCode: esic,
      aliases: [...aliases],
      notes,
    });
  }
  return out;
}
