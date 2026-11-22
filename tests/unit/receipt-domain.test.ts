import { describe, expect, it } from "vitest";
import { fillTemplate, paymentMessage, toReceiptData, type ReceiptRow } from "@/lib/domain/receipt";

const ROW: ReceiptRow = {
  receipt: { id: "r", receipt_no: "R/2026-27/0007", issued_on: "2026-12-08", language: "hi", voided: false, void_reason: null },
  payment: { id: "p", amount: 1_200_00, received_on: "2026-12-08", mode: "cash", reference: null, received_by: "Rajeev", received_by_code: "R" },
  client: { id: "c", firm_name: "UTTAM ENGINEERING", firm_name_hi: null, owner_name: "Ramesh", preferred_language: "hi", phone: null, whatsapp_phone: null },
  business: { name_en: "Rajeev Kumar Mishra", name_hi: "राजीव कुमार मिश्रा", address_en: "Munger, Bihar", address_hi: "मुंगेर, बिहार", phones: ["+919430449312"], signature_path: null },
  lines: [
    { kind: "pf", month: "2026-11-01", paise: 1_000_00, label: null },
    { kind: "esic", month: "2026-11-01", paise: 200_00, label: null },
    { kind: "charge", month: "2026-11-01", paise: 500_00, label: null },
  ],
  dues: 1_700_00, earlier: 0, applied: 1_200_00, advance_kept: 0, balance_after: 500_00,
  templates: { hi: "नमस्ते {owner_name} जी, ₹{amount} प्राप्त हुए, {date}, {mode}। {business_name}" },
  challans: [{ month: "2026-11-01", type: "pf", trrn: "3162612004578", number: null, paid_on: "2026-12-10" }],
};

describe("toReceiptData", () => {
  it("maps the database figures onto the receipt", () => {
    const r = toReceiptData(ROW);
    expect(r).toMatchObject({ receiptNo: "R/2026-27/0007", totalDuePaise: 1_700_00, receivedPaise: 1_200_00, balanceAfterPaise: 500_00, mode: "cash" });
    expect(r.receivedBy).toEqual({ en: "Rajeev", hi: "राजीव" });
    expect(r.challans).toEqual([{ month: "2026-11-01", pfTrrn: "3162612004578", paidOn: "2026-12-10" }]);
    expect(r.lines).toHaveLength(3);
  });
  it("shows what was received earlier on a second part payment", () => {
    const r = toReceiptData({ ...ROW, earlier: 1_200_00, applied: 500_00, payment: { ...ROW.payment, amount: 500_00 }, balance_after: 0 });
    expect([r.totalDuePaise, r.earlierPaise, r.receivedPaise, r.balanceAfterPaise]).toEqual([500_00, 1_200_00, 500_00, 0]);
  });
});

describe("messages", () => {
  it("fills the Hindi template", () => {
    expect(paymentMessage(ROW, "hi")).toBe("नमस्ते Ramesh जी, ₹1,200 प्राप्त हुए, 08/12/2026, नकद। राजीव कुमार मिश्रा");
  });
  it("falls back to the default English text when there is no template", () => {
    expect(paymentMessage(ROW, "en")).toBe("Namaste Ramesh ji,\nReceived ₹1,200 from UTTAM ENGINEERING on 08/12/2026 by cash. The receipt is attached. Thank you.\nRajeev Kumar Mishra");
  });
  it("leaves unknown placeholders visible", () => expect(fillTemplate("Hi {name} {oops}", { name: "A" })).toBe("Hi A {oops}"));
});
