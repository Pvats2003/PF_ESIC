import { describe, expect, it } from "vitest";
import { classifyService, monthsReferenced, parseInlineAmount, parseSheet, toPaise, type Cell, type SheetGrid } from "@/lib/import/parse-workbook";

const c = (v: Cell["v"], f?: string): Cell => (f ? { v, f } : { v });
function grid(name: string, rows: Array<Array<Cell["v"] | Cell>>): SheetGrid {
  return { name, rows: rows.map((r) => r.map((x) => (x !== null && typeof x === "object" && !(x instanceof Date) ? (x as Cell) : c(x as Cell["v"])))) };
}

// A small sheet shaped like the real ones: A1 month, header, clients, TOTAL, one-off lines, workings.
const SHEET = grid("SEPT26", [
  [new Date(Date.UTC(2026, 8, 1))],
  ["SL. NO.", "CONTRACTOR", "PF", "ESIC", "TOTAL", "CHARGE", "REAMARK"],
  [1, "UTTAM ENGG", null, null, null, 500, "A"],
  [2, "RAJESH KUMAR ", "`", null, null, 0, "D"],
  [3, "MITHILESH KUMAR", null, null, null, null, null],
  [4, "UTTAM ENGINEERING", null, null, null, 50, null],
  [null, "TOTAL", null, null, null, c(550, "SUM(F3:F6)")],
  [],
  [1, "SHRAWAN ELECTRICAL", "PF & ESIC-AUG-26", null, null, 1000],
  [2, "Shambhu Kr-Ino Const", "PF Claim", 200, new Date(Date.UTC(2026, 9, 3)), null, "R"],
  [null, "1 RAJ ENGINEERING- 50.00"],
  [null, "ADOPTER-1800.00"],
  [null, null, "PAPER", null, null, 220],
  [null, null, null, null, null, c(1250, "SUM(F9:F10)")],
  [null, null, null, "TOTAL", null, c(1800, "F7+F14")],
  [null, null, null, c(3400, "F15/2")],
  [null, null, null, c(200, "D16-3200")],
]);

describe("parseSheet", () => {
  const p = parseSheet(SHEET);

  it("reads the month from A1, not the sheet name", () => expect(p.month).toBe("2026-09-01"));

  it("reads client rows up to TOTAL, ignoring stray backticks", () => {
    expect(p.clientRows.map((r) => [r.rawName.trim(), r.chargePaise, r.remark])).toEqual([
      ["UTTAM ENGG", 50000, "A"],
      ["RAJESH KUMAR", 0, "D"],
      ["MITHILESH KUMAR", null, null],
      ["UTTAM ENGINEERING", 5000, null],
    ]);
    expect(p.clientRows[1].pfPaise).toBeNull();
    expect(p.clientRows[3].repeatInSheet).toBe(true);
  });

  it("keeps the TOTAL row so the import can be reconciled", () => {
    expect(p.total).toEqual({ ref: "SEPT26!F7", formula: "SUM(F3:F6)", valuePaise: 55000 });
    expect(p.clientRows.reduce((a, r) => a + (r.chargePaise ?? 0), 0)).toBe(p.total!.valuePaise);
  });

  it("reads one-off lines in their different layouts", () => {
    const x = p.extras.map((e) => ({ name: e.name, amt: e.amountPaise, type: e.serviceType, months: e.refersToMonths, partner: e.partnerCode, date: e.date }));
    expect(x).toEqual([
      { name: "SHRAWAN ELECTRICAL", amt: 100000, type: "monthly_fee", months: ["2026-08-01"], partner: null, date: null },
      { name: "Shambhu Kr-Ino Const", amt: 20000, type: "pf_claim", months: [], partner: "R", date: "2026-10-03" },
      { name: "RAJ ENGINEERING", amt: 5000, type: "other", months: [], partner: null, date: null },
      { name: "ADOPTER", amt: 180000, type: "other", months: [], partner: null, date: null },
    ]);
    expect(p.extras[3].possibleExpense).toBe(true);
    expect(p.extrasSubtotal?.valuePaise).toBe(125000);
  });

  it("finds shared expenses and settlement adjustments", () => {
    expect(p.sideNotes.filter((n) => n.kind === "expense").map((n) => [n.label, n.amountPaise])).toEqual([["PAPER", 22000]]);
    expect(p.sideNotes.filter((n) => n.kind === "adjustment").map((n) => n.amountPaise)).toEqual([320000]);
  });

  it("flags a TOTAL formula that skips client rows (the Nov 26 bug)", () => {
    const bad = parseSheet(grid("Nov 26", [[new Date(Date.UTC(2026, 10, 1))], ["SL. NO.", "CONTRACTOR"], [1, "A FIRM"], [2, "B FIRM"], [3, "C FIRM"], [null, "TOTAL", null, null, null, c(0, "SUM(F4:F5)")]]));
    expect(bad.warnings.join()).toMatch(/doesn't cover all client rows/);
    expect(bad.listOnly).toBe(true);
  });
});

describe("helpers", () => {
  it.each([
    ["PF & ESIC-MAR-26", ["2026-03-01"]],
    ["PF ESIC MAY-26", ["2026-05-01"]],
    ["PF AND ESIC FEB-26", ["2026-02-01"]],
    ["PF & ESIC - June & July-26", ["2026-06-01", "2026-07-01"]],
    ["PF & ESIC-July-26 AUG-26 & Sep-26", ["2026-07-01", "2026-08-01", "2026-09-01"]],
    ["PF & ESIC-AUG-25", ["2025-08-01"]],
    ["PF CLAIM", []],
    ["APPOINTMENT LETTER", []],
  ])("monthsReferenced(%j)", (t, out) => expect(monthsReferenced(t, "2026-09-01")).toEqual(out));

  it.each([
    ["PF Claim Form-D", "pf_claim"], ["Regustration", "registration"], ["PF ESIC CODE", "registration"],
    ["APPOINTMENT LETTER", "appointment_letter"], ["PF PASSWORD", "pf_password"], ["PF Card", "pf_card"],
    ["PF - NIL", "challan"], ["PF ESIC CHALLAN", "challan"],
  ])("classifyService(%j) → %s", (t, type) => expect(classifyService(t)).toBe(type));

  it("parses inline amounts and money cells", () => {
    expect(parseInlineAmount("2. PUNAM ENGINEERING-50.00")).toEqual({ name: "PUNAM ENGINEERING", amountPaise: 5000 });
    expect(parseInlineAmount("SHRAWAN ELECTRICAL PF-1000.00")).toEqual({ name: "SHRAWAN ELECTRICAL PF", amountPaise: 100000 });
    expect(parseInlineAmount("RAJESH KUMAR")).toBeNull();
    expect(toPaise("1,500.00")).toBe(150000);
    expect(toPaise("`")).toBeNull();
    expect(toPaise(12.5)).toBe(1250);
  });
});
