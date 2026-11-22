import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyImport, splitPaise, type ImportDecisions } from "@/lib/import/apply";
import { collectOccurrences, suggestMapping, type MappingRow } from "@/lib/import/mapping";
import { parseSheet, type Cell, type SheetGrid } from "@/lib/import/parse-workbook";
import { connect } from "./helpers";

const c = (v: Cell["v"], f?: string): Cell => (f ? { v, f } : { v });
const grid = (name: string, rows: Array<Array<Cell["v"] | Cell>>): SheetGrid => ({
  name,
  rows: rows.map((r) => r.map((x) => (x !== null && typeof x === "object" && !(x instanceof Date) ? (x as Cell) : c(x as Cell["v"])))),
});
const d = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));

// Two filled months + the current month's name list, shaped like the real workbook.
const SHEETS = [
  parseSheet(grid("AUG26", [
    [d(2026, 8)], ["SL. NO.", "CONTRACTOR", "PF", "ESIC", "TOTAL", "CHARGE", "REAMARK"],
    [1, "ZEBRA ENGG", null, null, null, 500, "A"],
    [2, "YAK TRADERS", null, null, null, 0, "D"],
    [3, "XENON WORKS", null, null, null, 300, "NA"],
    [null, "TOTAL", null, null, null, c(800, "SUM(F3:F5)")],
    [1, "Zebra Engineering", "APPOINTMENT LETTER", null, null, 100],
    [2, "Walkin Person", "PF CLAIM", null, null, 200],
    [null, null, "PAPER", null, null, 220],
    [null, null, null, null, null, c(300, "SUM(F7:F8)")],
  ])),
  parseSheet(grid("SEPT26", [
    [d(2026, 9)], ["SL. NO.", "CONTRACTOR", "PF", "ESIC", "TOTAL", "CHARGE", "REAMARK"],
    [1, "ZEBRA ENGINEERING", null, null, null, 500, "R"],
    [2, "YAK TRADERS", null, null, null, null, null],
    [null, "TOTAL", null, null, null, c(500, "SUM(F3:F4)")],
    [1, "Yak Traders", "PF & ESIC - AUG-26", null, null, 400],
    [null, null, null, null, null, c(400, "SUM(F6:F6)")],
  ])),
  parseSheet(grid("OCT26", [
    [d(2026, 10)], ["SL. NO.", "CONTRACTOR"], [1, "ZEBRA ENGG"], [2, "YAK TRADERS"], [null, "TOTAL", null, null, null, c(0, "SUM(F3:F4)")],
  ])),
];

const DECISIONS: ImportDecisions = {
  settled_through: "2026-08-01", skip_refs: [], blank_charges: { "SEPT26!B4": 250 }, expense_paid_by: { "AUG26!C9": "A" },
  live_month_dues: { "ZEBRA ENGINEERING": 500 }, client_pays_challan: [], rename: {},
};

let db: Client;
const approvedMapping = (): MappingRow[] => suggestMapping(collectOccurrences(SHEETS)).map((m) => ({ ...m, approve: "yes" }));
const input = (over: Partial<Parameters<typeof applyImport>[1]> = {}) => ({
  fileName: "test.xlsx", fileHash: "a".repeat(64), sheets: SHEETS, mapping: approvedMapping(), adjustments: [],
  vendors: [{ name: "ZEBRA ENGG", pf: "BRBHA0000001000", esicRaw: "42002136830001296" }], decisions: DECISIONS, importedBy: "test", ...over,
});

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => db.end());

describe("applyImport", () => {
  it("refuses until every mapping row is approved", async () => {
    const mapping = approvedMapping();
    mapping[0].approve = "";
    await expect(applyImport(db, input({ mapping }))).rejects.toThrow(/need "yes"/);
  });

  it("refuses to save anything if a month doesn't add up to the Excel TOTAL", async () => {
    const tampered = SHEETS.map((s) => (s.sheetName === "AUG26" ? { ...s, total: { ...s.total!, valuePaise: 99_900 } } : s));
    const before = (await db.query(`select count(*)::int n from monthly_records`)).rows[0].n;
    await expect(applyImport(db, input({ sheets: tampered, fileHash: "b".repeat(64) }))).rejects.toThrow(/don't match the Excel/);
    expect((await db.query(`select count(*)::int n from monthly_records`)).rows[0].n).toBe(before);
    expect((await db.query(`select status from import_batches where file_hash=$1`, ["b".repeat(64)])).rows[0].status).toBe("failed");
  });

  it("imports clients, months, one-off work and expenses, reconciled to the Excel", async () => {
    const r = await applyImport(db, input());
    expect(r.status).toBe("completed");
    expect(r.months.every((m) => m.ok)).toBe(true);

    const zebra = (await db.query(`select * from clients where source_ref='client:ZEBRA ENGINEERING'`)).rows[0];
    expect(zebra).toMatchObject({ kind: "regular", active: true, default_charge_paise: "50000", esic_code: "42002136830001296", esic_code_verified: false });
    const walk = (await db.query(`select kind from clients where source_ref='client:WALKIN PERSON'`)).rows[0];
    expect(walk.kind).toBe("occasional");
    const xenon = (await db.query(`select active from clients where source_ref='client:XENON WORKS'`)).rows[0];
    expect(xenon.active).toBe(false); // not in the current month's list

    // NA → no record; D → record with ₹0; the AUG-26 fee written in SEPT becomes an August extra
    const yak = (await db.query(`select id from clients where source_ref='client:YAK TRADERS'`)).rows[0].id;
    const recs = (await db.query(`select wage_month::text m, charge_paise::int ch, legacy_settled from monthly_records where client_id=$1 order by 1`, [yak])).rows;
    expect(recs).toEqual([{ m: "2026-08-01", ch: 0, legacy_settled: true }, { m: "2026-09-01", ch: 25000, legacy_settled: true }]);
    const fee = (await db.query(`select wage_month::text m, amount_paise::int a, service_type from extra_charges where client_id=$1`, [yak])).rows;
    expect(fee).toEqual([{ m: "2026-08-01", a: 40000, service_type: "monthly_fee" }]);
    expect((await db.query(`select count(*)::int n from monthly_records where source_ref like 'AUG26!B5'`)).rows[0].n).toBe(0);

    // Zebra still owes for September (listed in live_month_dues) → that month stays open
    const sept = (await db.query(`select legacy_settled from monthly_records where client_id=$1 and wage_month='2026-09-01'`, [zebra.id])).rows[0];
    expect(sept.legacy_settled).toBe(false);
    const paper = (await db.query(`select amount_paise::int a, p.code from expenses e join partners p on p.id=e.paid_by_partner_id where e.source_ref='AUG26!C9'`)).rows[0];
    expect(paper).toEqual({ a: 22000, code: "A" });
    const logged = (await db.query(`select count(*)::int n from import_row_log where batch_id=$1`, [r.batchId])).rows[0].n;
    expect(logged).toBeGreaterThan(5);
  });

  it("is safe to run again: same files change nothing, a rename never duplicates a client", async () => {
    expect((await applyImport(db, input())).status).toBe("already_imported");
    const r = await applyImport(db, input({ decisions: { ...DECISIONS, rename: { "YAK TRADERS": "YAK TRADERS PVT" } } }));
    expect(r.rows.imported).toBe(0);
    expect(r.after.clients).toBe(r.before.clients);
    expect((await db.query(`select firm_name from clients where source_ref='client:YAK TRADERS'`)).rows[0].firm_name).toBe("YAK TRADERS PVT");
  });
});

it("splits an amount across months exactly", () => {
  expect(splitPaise(100000, 2)).toEqual([50000, 50000]);
  expect(splitPaise(7500, 3)).toEqual([2500, 2500, 2500]);
  expect(splitPaise(100, 3)).toEqual([34, 33, 33]);
});
