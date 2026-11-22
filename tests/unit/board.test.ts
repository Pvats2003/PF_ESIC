import { describe, expect, it } from "vitest";
import { matchesFilter, matchesSearch, parseMonthParam, summarize, type BoardRow } from "@/lib/domain/board";

const row = (over: Partial<BoardRow>): BoardRow => ({
  monthly_record_id: "m", client_id: "c", wage_month: "2026-11-01", due_date: "2026-12-15", challan_payer: "us", legacy_settled: false,
  due_to_us: 0, received: 0, owes: 0, amount_status: "ENTERED", notification_status: "NOT_NOTIFIED", payment_status: "UNPAID",
  pf_challan_status: "PENDING", esic_challan_status: "PENDING", receipt_status: "NOT_ISSUED", receipt_shared: false, receipt_needs_reissue: false,
  overdue: false, overall_status: "NOT_NOTIFIED", pf_paise: 0, esic_paise: 0, charge_paise: 0, extras_paise: 0, firm_name: "X", owner_name: null,
  phone: null, whatsapp_phone: null, preferred_language: "hi", esic_code_verified: false, has_esic_code: false, partner_code: "A", partner_name: "Alok", aliases: [], latest_receipt_id: null, challans: null,
  ...over,
});

describe("summarize", () => {
  it("keeps government money and fees separate", () => {
    const s = summarize([
      row({ pf_paise: 1_000_000, esic_paise: 200_000, charge_paise: 50_000, extras_paise: 10_000, due_to_us: 1_260_000, received: 1_260_000, owes: 0, overall_status: "DONE", payment_status: "PAID", pf_challan_status: "PAID", esic_challan_status: "PAID" }),
      row({ pf_paise: null, esic_paise: null, amount_status: "AMOUNTS_PENDING", overall_status: "AMOUNTS_PENDING", charge_paise: 100_000 }),
      row({ pf_paise: 500_000, esic_paise: 0, charge_paise: 0, due_to_us: 500_000, owes: 500_000, overdue: true, overall_status: "OVERDUE", esic_challan_status: "NOT_REQUIRED" }),
    ]);
    expect(s).toMatchObject({
      total: 3, done: 1, pfPaise: 1_500_000, esicPaise: 200_000, feesPaise: 160_000,
      collectedPaise: 1_260_000, pendingPaise: 500_000, owingClients: 1, amountsPending: 1, challansDone: 1, overdue: 1,
    });
  });
});

describe("filters", () => {
  it("sorts each row into the right quick filter", () => {
    const pending = row({ payment_status: "UNPAID", overall_status: "PAYMENT_PENDING" });
    const part = row({ payment_status: "PART_PAID", overall_status: "PART_PAID" });
    const proof = row({ payment_status: "PAID", pf_challan_status: "PAID", esic_challan_status: "PAID", overall_status: "PROOF_PENDING" });
    expect(matchesFilter(pending, "payment")).toBe(true);
    expect(matchesFilter(part, "part")).toBe(true);
    expect(matchesFilter(part, "payment")).toBe(false);
    expect(matchesFilter(proof, "challan")).toBe(true);
    expect(matchesFilter(row({ amount_status: "AMOUNTS_PENDING", payment_status: "UNPAID" }), "payment")).toBe(false);
  });
});

describe("search", () => {
  const uttam = { firm_name: "UTTAM ENGINEERING", owner_name: "Ramesh Prasad", aliases: ["UTTAM ENGINEERING", "UTTAM ENGG WORKS"] };
  it.each(["uttam engg", "Uttam", "ramesh", "uttamengineering", ""])("finds %j", (q) => expect(matchesSearch(uttam, q)).toBe(true));
  it("doesn't match other names", () => expect(matchesSearch(uttam, "sunil")).toBe(false));
});

it("reads the month from the URL", () => {
  expect(parseMonthParam("2026-11")).toBe("2026-11-01");
  expect(parseMonthParam("2026-13")).toBeNull();
  expect(parseMonthParam(["2026-01"])).toBe("2026-01-01");
  expect(parseMonthParam(undefined)).toBeNull();
});
