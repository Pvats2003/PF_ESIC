/**
 * Today's queue: what to do next, most urgent first. Built from board rows
 * (this month and last month). Pure (unit-tested).
 */
import type { BoardRow } from "./board";

export type QueueKind = "overdue" | "remind" | "file_challan" | "proof" | "share_receipt";

export interface QueueItem {
  kind: QueueKind;
  row: BoardRow;
}

export const QUEUE_LABELS: Record<QueueKind, { title: string; action: string; why: (r: BoardRow) => string }> = {
  overdue: { title: "Overdue", action: "Send overdue reminder", why: () => "Past the due date with money still owed" },
  remind: { title: "Send reminders", action: "Send reminder", why: (r) => (r.challan_payer === "client" ? "Challan details not sent yet" : "Dues not sent yet") },
  file_challan: { title: "Challans to file", action: "Add challan", why: () => "Money received; challan not recorded" },
  proof: { title: "Challan proof pending", action: "Confirm proof", why: () => "Client paid the challan; proof not confirmed" },
  share_receipt: { title: "Receipts to share", action: "Share receipt", why: () => "Receipt issued but not sent" },
};

const ORDER: QueueKind[] = ["overdue", "remind", "file_challan", "proof", "share_receipt"];

const challanPending = (r: BoardRow) => r.pf_challan_status === "PENDING" || r.esic_challan_status === "PENDING";

export function classify(r: BoardRow): QueueKind | null {
  if (r.legacy_settled || r.overall_status === "DONE" || r.amount_status === "AMOUNTS_PENDING") return null;
  if (r.overdue && r.owes > 0) return "overdue";
  if (r.notification_status === "NOT_NOTIFIED" && (r.payment_status === "UNPAID" || r.payment_status === "PART_PAID" || (r.challan_payer === "client" && challanPending(r)))) return "remind";
  if (r.challan_payer === "us" && challanPending(r) && (r.payment_status === "PAID" || r.received >= (r.pf_paise ?? 0) + (r.esic_paise ?? 0))) return "file_challan";
  if (r.overall_status === "PROOF_PENDING") return "proof";
  if (r.overall_status === "RECEIPT_TO_SHARE" && r.latest_receipt_id) return "share_receipt";
  return null;
}

export function buildQueue(rows: BoardRow[]): { items: QueueItem[]; counts: Record<QueueKind, number>; amountsPending: number } {
  const items = rows
    .map((row) => ({ row, kind: classify(row) }))
    .filter((x): x is QueueItem => x.kind !== null)
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.row.wage_month < b.row.wage_month ? -1 : a.row.wage_month > b.row.wage_month ? 1 : 0) || b.row.owes - a.row.owes);
  const counts = Object.fromEntries(ORDER.map((k) => [k, items.filter((i) => i.kind === k).length])) as Record<QueueKind, number>;
  return { items, counts, amountsPending: rows.filter((r) => !r.legacy_settled && r.amount_status === "AMOUNTS_PENDING").length };
}
