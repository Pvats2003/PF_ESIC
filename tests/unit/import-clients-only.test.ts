import { describe, expect, it } from "vitest";
import { buildFreshClients } from "@/lib/import/clients-only";
import { parseSheet, type Cell, type SheetGrid } from "@/lib/import/parse-workbook";

const c = (v: Cell["v"], f?: string): Cell => (f ? { v, f } : { v });
const grid = (name: string, rows: Array<Array<Cell["v"] | Cell>>): SheetGrid => ({
  name, rows: rows.map((r) => r.map((x) => (x !== null && typeof x === "object" && !(x instanceof Date) ? (x as Cell) : c(x as Cell["v"])))),
});
const d = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));
const H = ["SL. NO.", "CONTRACTOR", "PF", "ESIC", "TOTAL", "CHARGE", "REAMARK"];

const sheets = [
  parseSheet(grid("SEP", [[d(2026, 9)], H, [1, "UTTAM ENGG", null, null, null, 800, "R"], [2, "RAJESH KUMAR", null, null, null, 1000, "A"], [3, "GONE FIRM", null, null, null, 500, "A"], [null, "TOTAL", null, null, null, c(2300, "SUM(F3:F5)")]])),
  parseSheet(grid("OCT", [[d(2026, 10)], H, [1, "UTTAM ENGINEERING", null, null, null, 500, null], [2, "RAJESH KUMAR", null, null, null, null, null], [3, "RAJESH KUMAR MALAKAR", null, null, null, 1500, "A"], [null, "TOTAL", null, null, null, c(2000, "SUM(F3:F5)")]])),
  parseSheet(grid("NOV", [[d(2026, 11)], ["SL. NO.", "CONTRACTOR"], [1, "UTTAM ENGG"], [2, "RAJESH KUMAR"], [3, "RAJESH KUMAR MALAKAR"], [4, "NEW FIRM"], [null, "TOTAL", null, null, null, c(0, "SUM(F3:F6)")]])),
];

describe("fresh start: clients only", () => {
  const out = buildFreshClients(sheets, [{ name: "UTTAM ENGINEERING", pf: "BRBHA1", esicRaw: "42002136830001296" }]);
  const by = Object.fromEntries(out.map((x) => [x.name, x]));

  it("takes exactly the newest sheet's clients (old ones are left out)", () => {
    expect(out.map((x) => x.name)).toEqual(["UTTAM ENGINEERING", "RAJESH KUMAR", "RAJESH KUMAR MALAKAR", "NEW FIRM"]);
  });
  it("uses the latest non-zero charge and the latest A/R remark", () => {
    expect(by["UTTAM ENGINEERING"]).toMatchObject({ chargePaise: 50000, chargeFrom: "OCT", partner: "R" });
    expect(by["RAJESH KUMAR"]).toMatchObject({ chargePaise: 100000, chargeFrom: "SEP", partner: "A" }); // Oct blank → Sep
  });
  it("keeps look-alike clients apart", () => {
    expect(by["RAJESH KUMAR MALAKAR"].chargePaise).toBe(150000);
    expect(by["RAJESH KUMAR"].aliases).not.toContain("RAJESH KUMAR MALAKAR");
  });
  it("flags new clients and unverified ESIC codes", () => {
    expect(by["NEW FIRM"]).toMatchObject({ chargePaise: 0, partner: null });
    expect(by["NEW FIRM"].notes.join()).toMatch(/set the service charge/);
    expect(by["UTTAM ENGINEERING"]).toMatchObject({ pfCode: "BRBHA1", esicCode: "42002136830001296" });
    expect(by["UTTAM ENGINEERING"].notes.join()).toMatch(/needs checking/);
    expect(by["UTTAM ENGINEERING"].aliases).toEqual(expect.arrayContaining(["UTTAM ENGG", "UTTAM ENGINEERING"]));
  });
});
