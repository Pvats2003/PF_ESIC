import { describe, expect, it } from "vitest";
import { nextStep, type NextStepInput } from "@/lib/domain/next-step";

const base: NextStepInput = { overall_status: "PAYMENT_PENDING", owes: 500_00, pf_challan_status: "PENDING", esic_challan_status: "PENDING", latest_receipt_id: null };
const step = (x: Partial<NextStepInput>) => nextStep({ ...base, ...x });

describe("next step button", () => {
  it("follows the month through its life", () => {
    expect(step({ overall_status: "AMOUNTS_PENDING" })).toBe("enter_amounts");
    expect(step({ overall_status: "NOT_NOTIFIED" })).toBe("remind");
    expect(step({ overall_status: "PAYMENT_PENDING" })).toBe("pay");
    expect(step({ overall_status: "PART_PAID" })).toBe("pay");
    expect(step({ overall_status: "CHALLAN_PENDING", owes: 0 })).toBe("challan");
    expect(step({ overall_status: "PROOF_PENDING", owes: 0 })).toBe("proof");
    expect(step({ overall_status: "RECEIPT_TO_SHARE", owes: 0, latest_receipt_id: "r1" })).toBe("share_receipt");
    expect(step({ overall_status: "RECEIPT_TO_REISSUE", owes: 0, latest_receipt_id: "r1" })).toBe("reissue");
    expect(step({ overall_status: "DONE", owes: 0 })).toBeNull();
  });
  it("overdue with money owed asks for the payment; with nothing owed, the challan", () => {
    expect(step({ overall_status: "OVERDUE" })).toBe("pay");
    expect(step({ overall_status: "OVERDUE", owes: 0 })).toBe("challan");
  });
  it("shows nothing for settled history or a receipt it can't open", () => {
    expect(step({ legacy_settled: true })).toBeNull();
    expect(step({ overall_status: "RECEIPT_TO_SHARE", owes: 0 })).toBeNull();
  });
});
