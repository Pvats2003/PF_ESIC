/**
 * What the Call / WhatsApp sheet offers for a month: which ready messages make
 * sense, the suggested one first. Pure (unit-tested).
 */
import { reminderKind, type AnyMessageKey, type MonthFigures } from "./messages";

export interface ContactMonth { monthlyRecordId: string; figures: MonthFigures; hasChallan: boolean; latestReceiptId: string | null }

type Challan = { type: "pf" | "esic"; trrn: string | null; number: string | null; paid_on?: string | null };

/** TRRN / challan numbers and the latest paid date, for the "Challan filed" message. */
export function challanFigures(challans: Challan[] | null | undefined): Pick<MonthFigures, "pf_trrn" | "esic_challan_no" | "challan_paid_on"> {
  const pf = challans?.find((c) => c.type === "pf");
  const esic = challans?.find((c) => c.type === "esic");
  const dates = (challans ?? []).map((c) => c.paid_on).filter((d): d is string => !!d).sort();
  return {
    pf_trrn: pf ? pf.trrn ?? pf.number : null,
    esic_challan_no: esic ? esic.number ?? esic.trrn : null,
    challan_paid_on: dates.at(-1) ?? null,
  };
}

export interface Option { key: AnyMessageKey | "receipt"; label: string; why: string }

/** Which messages make sense for this month, the suggested one first. */
export function messageOptions(m: ContactMonth): Option[] {
  const f = m.figures;
  const all: Option[] = [];
  const ask: Option = { key: "ask_details", label: "Ask for attendance and wages", why: "Before PF/ESIC is known: asks them to send this month's details" };
  const free: Option = { key: "free", label: "Write your own message", why: "A greeting and your name; type anything in between" };
  // PF/ESIC not entered yet: the amounts would be wrong, so only ask for the details (or write freely).
  if (f.pf_paise === null || f.esic_paise === null) {
    if (f.charge_paise + f.extras_paise > 0 && f.challan_payer === "client") all.push({ key: "challan_ready_client_pays", label: "Challan ready", why: "Their PF/ESIC figures to pay, and our fee" });
    return [ask, ...all, free];
  }
  if (f.challan_payer === "us") all.push({ key: "dues_we_pay", label: "Dues reminder", why: "PF + ESIC + our fee, and the date to pay by" });
  else all.push({ key: "challan_ready_client_pays", label: "Challan ready", why: "Their PF/ESIC figures to pay, and our fee" });
  if (f.owes > 0) all.push({ key: "overdue", label: "Overdue reminder", why: "Polite reminder that money is still owed" });
  if (m.hasChallan) all.push({ key: "challan_filed", label: "Challan filed", why: "TRRN and challan numbers, so they know it's paid" });
  if (m.latestReceiptId) all.push({ key: "receipt", label: "Payment thanks with receipt", why: "Sends the latest receipt" });
  // Money owed → ask for it; nothing owed → tell them the challan is paid, or thank them.
  const suggested = f.owes > 0 ? reminderKind(f) : m.hasChallan ? "challan_filed" : m.latestReceiptId ? "receipt" : reminderKind(f);
  return [...all.filter((o) => o.key === suggested), ...all.filter((o) => o.key !== suggested), free];
}

