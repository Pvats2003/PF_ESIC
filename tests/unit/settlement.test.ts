import { describe, expect, it } from "vitest";
import { computeSettlement, type SettlementData, type SettlementPartner } from "@/lib/domain/settlement";

const p = (code: "A" | "R", over: Partial<SettlementPartner> = {}): SettlementPartner => ({
  id: code, code, name: code === "A" ? "Alok" : "Rajeev", fees_received: 0, expenses_paid: 0, transfers_net: 0,
  earned_as_handler: 0, share_percent: 50, gov_held: 0, ...over,
});
const data = (a: Partial<SettlementPartner>, r: Partial<SettlementPartner>, extra: Partial<SettlementData> = {}): SettlementData => ({
  from: "2026-11-01", to: "2026-11-30", partners: [p("A", a), p("R", r)], fees_no_handler: 0, expenses_unassigned: 0, split_from: "2025-04-01", ...extra,
});

describe("partner settlement", () => {
  it("Rajeev collected all fees: he owes Alok half", () => {
    const s = computeSettlement(data({}, { fees_received: 500_00 }));
    expect(s.pool).toBe(500_00);
    expect([s.payer?.name, s.payee?.name, s.amount]).toEqual(["Rajeev", "Alok", 250_00]);
  });

  it("expenses come off before the split, and the partner who paid them is credited", () => {
    // Fees 20,000 (A 15,000, R 5,000). Rajeev paid ink ₹1,850 + paper ₹210.
    const s = computeSettlement(data({ fees_received: 15_000_00 }, { fees_received: 5_000_00, expenses_paid: 2_060_00 }));
    expect(s.pool).toBe(17_940_00);
    expect(s.rows.map((r) => r.share)).toEqual([8_970_00, 8_970_00]);
    expect([s.payer?.code, s.amount]).toEqual(["A", 6_030_00]); // A holds 15,000 vs share 8,970
  });

  it("settlements already paid reduce what's owed", () => {
    const s = computeSettlement(data({ transfers_net: 1_000_00 }, { fees_received: 3_000_00, transfers_net: -1_000_00 }));
    expect([s.payer?.code, s.amount]).toEqual(["R", 500_00]);
  });

  it("even split means nobody owes anything", () => {
    const s = computeSettlement(data({ fees_received: 1_000_00 }, { fees_received: 1_000_00 }));
    expect([s.payer, s.amount]).toEqual([null, 0]);
  });

  it("odd paise never go missing", () => {
    const s = computeSettlement(data({ fees_received: 101 }, { share_percent: 50 }));
    expect(s.rows[0].share + s.rows[1].share).toBe(101);
  });

  it("uses an uneven split", () => {
    const s = computeSettlement(data({ fees_received: 1_000_00, share_percent: 60 }, { share_percent: 40 }));
    expect([s.payer?.code, s.amount, s.splitOk]).toEqual(["A", 400_00, true]);
  });
});
