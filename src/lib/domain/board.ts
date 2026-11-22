/**
 * The month board: types for what the `board()` database function returns,
 * plus totals, filters and search. Pure functions (unit-tested).
 */
import type { ISODate } from "@/lib/format/dates";
import { compactKey, normalizeName } from "@/lib/import/normalize";

export type OverallStatus =
  | "AMOUNTS_PENDING" | "OVERDUE" | "NOT_NOTIFIED" | "PART_PAID" | "PAYMENT_PENDING"
  | "CHALLAN_PENDING" | "PROOF_PENDING" | "RECEIPT_TO_REISSUE" | "RECEIPT_TO_SHARE" | "DONE";

export interface BoardRow {
  monthly_record_id: string;
  client_id: string;
  wage_month: ISODate;
  due_date: ISODate;
  challan_payer: "us" | "client";
  legacy_settled: boolean;
  due_to_us: number;
  received: number;
  owes: number;
  amount_status: "AMOUNTS_PENDING" | "ENTERED";
  notification_status: "NOTIFIED" | "NOT_NOTIFIED";
  payment_status: "NOT_REQUIRED" | "UNPAID" | "PART_PAID" | "PAID";
  pf_challan_status: "NOT_REQUIRED" | "PENDING" | "PAID" | "VERIFIED";
  esic_challan_status: "NOT_REQUIRED" | "PENDING" | "PAID" | "VERIFIED";
  receipt_status: "NOT_REQUIRED" | "NOT_ISSUED" | "ISSUED" | "VOIDED";
  receipt_shared: boolean;
  receipt_needs_reissue: boolean;
  overdue: boolean;
  overall_status: OverallStatus;
  pf_paise: number | null;
  esic_paise: number | null;
  charge_paise: number;
  extras_paise: number;
  firm_name: string;
  owner_name: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  preferred_language: "hi" | "en";
  esic_code_verified: boolean;
  has_esic_code: boolean;
  partner_code: "A" | "R" | null;
  partner_name: string | null;
  aliases: string[];
  latest_receipt_id: string | null;
  challans: Array<{ id: string; type: "pf" | "esic"; trrn: string | null; number: string | null; paid_on: string; paid_by: "us" | "client"; verified: boolean; has_evidence: boolean }> | null;
}

export interface Board {
  month: ISODate;
  today: ISODate;
  due_day: number;
  rows: BoardRow[];
  not_started: number;
  partners?: Array<{ id: string; code: "A" | "R"; name: string }>;
}

const challanDone = (s: BoardRow["pf_challan_status"]) => s !== "PENDING";

export function summarize(rows: BoardRow[]) {
  const sum = (f: (r: BoardRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  return {
    total: rows.length,
    done: rows.filter((r) => r.overall_status === "DONE").length,
    pfPaise: sum((r) => r.pf_paise ?? 0),
    esicPaise: sum((r) => r.esic_paise ?? 0),
    feesPaise: sum((r) => r.charge_paise + r.extras_paise),
    collectedPaise: sum((r) => r.received),
    pendingPaise: sum((r) => r.owes),
    owingClients: rows.filter((r) => r.owes > 0).length,
    amountsPending: rows.filter((r) => r.amount_status === "AMOUNTS_PENDING").length,
    challansDone: rows.filter((r) => challanDone(r.pf_challan_status) && challanDone(r.esic_challan_status) && r.amount_status === "ENTERED").length,
    notNotified: rows.filter((r) => r.overall_status === "NOT_NOTIFIED").length,
    overdue: rows.filter((r) => r.overdue).length,
  };
}

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "amounts", label: "Amounts not entered" },
  { id: "not_notified", label: "Not notified" },
  { id: "payment", label: "Payment pending" },
  { id: "part", label: "Part paid" },
  { id: "challan", label: "Challan not paid" },
  { id: "overdue", label: "Overdue" },
  { id: "done", label: "Done" },
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];

export function matchesFilter(r: BoardRow, f: FilterId): boolean {
  switch (f) {
    case "all": return true;
    case "amounts": return r.amount_status === "AMOUNTS_PENDING";
    case "not_notified": return r.overall_status === "NOT_NOTIFIED";
    case "payment": return r.payment_status === "UNPAID" && r.amount_status === "ENTERED";
    case "part": return r.payment_status === "PART_PAID";
    case "challan": return r.amount_status === "ENTERED" && (!challanDone(r.pf_challan_status) || !challanDone(r.esic_challan_status) || r.overall_status === "PROOF_PENDING");
    case "overdue": return r.overdue;
    case "done": return r.overall_status === "DONE";
  }
}

/** Search by firm, owner or any old spelling ("uttam engg" finds UTTAM ENGINEERING). */
export function matchesSearch(r: { firm_name: string; owner_name: string | null; aliases: string[] }, query: string): boolean {
  const q = normalizeName(query);
  if (!q) return true;
  const qc = compactKey(query);
  const hay = [r.firm_name, r.owner_name ?? "", ...r.aliases].map(normalizeName);
  return hay.some((h) => h.includes(q) || h.replace(/ /g, "").includes(qc));
}

/** "2026-11" from the URL → "2026-11-01"; anything else → null. */
export function parseMonthParam(v: unknown): ISODate | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? `${s}-01` : null;
}
