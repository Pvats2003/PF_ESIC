import { describe, expect, it } from "vitest";
import { challanFigures, messageOptions, type ContactMonth } from "@/lib/domain/contact";
import type { MonthFigures } from "@/lib/domain/messages";

const figures: MonthFigures = {
  firm_name: "UTTAM ENGINEERING", owner_name: "Ramesh", wage_month: "2026-11-01", due_date: "2026-12-15", challan_payer: "us",
  pf_paise: 12_310_00, esic_paise: 1_931_00, charge_paise: 500_00, extras_paise: 0, owes: 14_741_00, overdue: false,
};
const month = (f: Partial<MonthFigures>, m: Partial<ContactMonth> = {}): ContactMonth =>
  ({ monthlyRecordId: "m1", figures: { ...figures, ...f }, hasChallan: false, latestReceiptId: null, ...m });
const keys = (m: ContactMonth) => messageOptions(m).map((o) => o.key);

describe("Call / WhatsApp: which ready messages, suggested first", () => {
  it("we pay, money owed: dues reminder first", () => {
    expect(keys(month({}))).toEqual(["dues_we_pay", "overdue", "free"]);
  });
  it("client pays the challan: challan-ready message instead of dues", () => {
    expect(keys(month({ challan_payer: "client", owes: 500_00 }))).toEqual(["challan_ready_client_pays", "overdue", "free"]);
  });
  it("past the due date with money owed: overdue first", () => {
    expect(keys(month({ overdue: true }))[0]).toBe("overdue");
  });
  it("paid and challan filed: 'challan filed' first, then receipt", () => {
    expect(keys(month({ owes: 0 }, { hasChallan: true, latestReceiptId: "r1" }))).toEqual(["challan_filed", "dues_we_pay", "receipt", "free"]);
  });
  it("PF/ESIC not entered yet, or a ₹0 month: still offers WhatsApp — ask for the details first", () => {
    expect(keys(month({ pf_paise: null, esic_paise: null, owes: 0 }))).toEqual(["ask_details", "free"]);
    expect(keys(month({ pf_paise: null, esic_paise: null, charge_paise: 0, owes: 0 }))[0]).toBe("ask_details");
    expect(keys(month({ pf_paise: 0, esic_paise: 0, charge_paise: 0, owes: 0 }))).toEqual(["dues_we_pay", "free"]);
  });
  it("paid, no challan yet: receipt thanks first", () => {
    expect(keys(month({ owes: 0 }, { latestReceiptId: "r1" }))[0]).toBe("receipt");
  });
});

describe("challan numbers for the 'challan filed' message", () => {
  it("takes the PF TRRN, the ESIC challan number and the latest paid date", () => {
    expect(challanFigures([
      { type: "pf", trrn: "3162612004578", number: null, paid_on: "2026-12-10" },
      { type: "esic", trrn: null, number: "42-0048812", paid_on: "2026-12-12" },
    ])).toEqual({ pf_trrn: "3162612004578", esic_challan_no: "42-0048812", challan_paid_on: "2026-12-12" });
  });
  it("is empty when nothing is filed", () => {
    expect(challanFigures(null)).toEqual({ pf_trrn: null, esic_challan_no: null, challan_paid_on: null });
  });
});
