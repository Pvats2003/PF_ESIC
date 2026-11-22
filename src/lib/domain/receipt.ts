/**
 * Turns what the `receipt_data()` database function returns into the Receipt
 * component's props and the WhatsApp message. Pure (unit-tested).
 */
import type { ReceiptData, ReceiptLine } from "@/components/receipt/receipt";
import { formatDate, formatMonth, type ISODate, type Lang } from "@/lib/format/dates";
import { formatINR } from "@/lib/format/money";

export interface ReceiptRow {
  receipt: { id: string; receipt_no: string; issued_on: ISODate; language: Lang; voided: boolean; void_reason: string | null };
  payment: { id: string; amount: number; received_on: ISODate; mode: "cash" | "upi" | "bank"; reference: string | null; received_by: string; received_by_code: string };
  client: { id: string; firm_name: string; firm_name_hi: string | null; owner_name: string | null; preferred_language: Lang; phone: string | null; whatsapp_phone: string | null };
  business: { name_en: string; name_hi: string; address_en: string; address_hi: string; phones: string[]; signature_path: string | null };
  lines: Array<{ kind: "pf" | "esic" | "charge" | "extra"; month: ISODate; paise: number; label: string | null }>;
  dues: number;
  earlier: number;
  applied: number;
  advance_kept: number;
  balance_after: number;
  templates: Partial<Record<Lang, string>> | null;
  challans: Array<{ month: ISODate; type: "pf" | "esic"; trrn: string | null; number: string | null; paid_on: ISODate | null }>;
}

const PARTNER_HI: Record<string, string> = { A: "आलोक", R: "राजीव" };

export function toReceiptData(d: ReceiptRow): ReceiptData {
  const lines: ReceiptLine[] = d.lines.map((l) =>
    l.kind === "extra" ? { kind: "extra", month: l.month, label: l.label ?? "Other work", paise: l.paise } : { kind: l.kind, month: l.month, paise: l.paise },
  );
  const byMonth = new Map<ISODate, { month: ISODate; pfTrrn?: string | null; esicChallanNo?: string | null; paidOn?: ISODate | null }>();
  for (const c of d.challans) {
    const m = byMonth.get(c.month) ?? { month: c.month };
    if (c.type === "pf") m.pfTrrn = c.trrn ?? c.number;
    else m.esicChallanNo = c.number ?? c.trrn;
    m.paidOn = c.paid_on ?? m.paidOn;
    byMonth.set(c.month, m);
  }
  return {
    business: { nameEn: d.business.name_en, nameHi: d.business.name_hi, addressEn: d.business.address_en, addressHi: d.business.address_hi, phones: d.business.phones },
    receiptNo: d.receipt.receipt_no,
    issuedOn: d.receipt.issued_on,
    client: { firmName: d.client.firm_name, firmNameHi: d.client.firm_name_hi, ownerName: d.client.owner_name },
    lines,
    totalDuePaise: d.dues - d.earlier,
    earlierPaise: d.earlier,
    receivedPaise: d.payment.amount,
    advancePaise: d.advance_kept,
    mode: d.payment.mode,
    reference: d.payment.reference,
    receivedBy: { en: d.payment.received_by, hi: PARTNER_HI[d.payment.received_by_code] },
    balanceAfterPaise: d.balance_after,
    challans: [...byMonth.values()],
    voided: d.receipt.voided,
  };
}

/** Replace {placeholders}; unknown ones are left visible so a typo in a template is noticed. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

const MODE: Record<Lang, Record<ReceiptRow["payment"]["mode"], string>> = {
  en: { cash: "cash", upi: "UPI", bank: "bank transfer" },
  hi: { cash: "नकद", upi: "UPI", bank: "बैंक ट्रांसफर" },
};

export function paymentMessage(d: ReceiptRow, lang: Lang): string {
  const fallback =
    lang === "hi"
      ? "नमस्ते {owner_name} जी,\n{firm_name} से ₹{amount} प्राप्त हुए, {date}, {mode}। रसीद संलग्न है। धन्यवाद।\n{business_name}"
      : "Namaste {owner_name} ji,\nReceived ₹{amount} from {firm_name} on {date} by {mode}. The receipt is attached. Thank you.\n{business_name}";
  const months = [...new Set(d.lines.map((l) => l.month))].map((m) => formatMonth(m, lang)).join(", ");
  return fillTemplate(d.templates?.[lang] ?? fallback, {
    owner_name: d.client.owner_name ?? (lang === "hi" ? "महोदय" : "Sir/Madam"),
    firm_name: lang === "hi" && d.client.firm_name_hi ? d.client.firm_name_hi : d.client.firm_name,
    amount: formatINR(d.payment.amount, { symbol: false }),
    date: formatDate(d.payment.received_on),
    mode: MODE[lang][d.payment.mode],
    month: months,
    business_name: lang === "hi" ? d.business.name_hi || d.business.name_en : d.business.name_en,
  });
}
