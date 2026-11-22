import { describe, expect, it } from "vitest";
import type { BoardRow } from "@/lib/domain/board";
import { buildQueue, classify } from "@/lib/domain/queue";

const row = (over: Partial<BoardRow>): BoardRow => ({
  monthly_record_id: Math.random().toString(), client_id: "c", wage_month: "2026-11-01", due_date: "2026-12-15", challan_payer: "us", legacy_settled: false,
  due_to_us: 1000, received: 0, owes: 1000, amount_status: "ENTERED", notification_status: "NOT_NOTIFIED", payment_status: "UNPAID",
  pf_challan_status: "PENDING", esic_challan_status: "PENDING", receipt_status: "NOT_ISSUED", receipt_shared: false, receipt_needs_reissue: false,
  overdue: false, overall_status: "NOT_NOTIFIED", pf_paise: 800, esic_paise: 100, charge_paise: 100, extras_paise: 0, firm_name: "X", owner_name: null,
  phone: null, whatsapp_phone: null, preferred_language: "hi", esic_code_verified: false, has_esic_code: false, partner_code: "A", partner_name: "Alok",
  aliases: [], latest_receipt_id: null, challans: null, ...over,
});

describe("queue", () => {
  it("classifies each step", () => {
    expect(classify(row({}))).toBe("remind");
    expect(classify(row({ overdue: true }))).toBe("overdue");
    expect(classify(row({ notification_status: "NOTIFIED", overall_status: "PAYMENT_PENDING" }))).toBeNull(); // waiting on the client
    expect(classify(row({ notification_status: "NOTIFIED", payment_status: "PAID", received: 1000, owes: 0, overall_status: "CHALLAN_PENDING" }))).toBe("file_challan");
    expect(classify(row({ challan_payer: "client", payment_status: "NOT_REQUIRED", owes: 0, notification_status: "NOTIFIED", pf_challan_status: "PAID", esic_challan_status: "PAID", overall_status: "PROOF_PENDING" }))).toBe("proof");
    expect(classify(row({ payment_status: "PAID", owes: 0, notification_status: "NOTIFIED", pf_challan_status: "PAID", esic_challan_status: "PAID", overall_status: "RECEIPT_TO_SHARE", latest_receipt_id: "r1" }))).toBe("share_receipt");
    expect(classify(row({ amount_status: "AMOUNTS_PENDING", overall_status: "AMOUNTS_PENDING" }))).toBeNull();
    expect(classify(row({ overall_status: "DONE" }))).toBeNull();
  });

  it("puts overdue first and counts each category", () => {
    const q = buildQueue([
      row({ firm_name: "B" }),
      row({ firm_name: "A", overdue: true, wage_month: "2026-10-01" }),
      row({ amount_status: "AMOUNTS_PENDING", overall_status: "AMOUNTS_PENDING" }),
    ]);
    expect(q.items.map((i) => i.row.firm_name)).toEqual(["A", "B"]);
    expect(q.counts).toMatchObject({ overdue: 1, remind: 1, file_challan: 0 });
    expect(q.amountsPending).toBe(1);
  });
});
