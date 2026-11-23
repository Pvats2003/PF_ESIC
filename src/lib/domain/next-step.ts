/**
 * The one thing to do next for a client's month, shown as a labelled button
 * ("Send reminder", "Record payment"…), so nobody has to read the status and
 * work out the action. Pure (unit-tested).
 */
export type NextStep = "enter_amounts" | "remind" | "pay" | "challan" | "proof" | "share_receipt" | "reissue";

export interface NextStepInput {
  overall_status: string;
  owes: number;
  legacy_settled?: boolean;
  pf_challan_status: string;
  esic_challan_status: string;
  latest_receipt_id?: string | null;
}

export const NEXT_STEP_LABEL: Record<NextStep, string> = {
  enter_amounts: "Enter PF/ESIC",
  remind: "Send reminder",
  pay: "Record payment",
  challan: "Add challan",
  proof: "Confirm proof",
  share_receipt: "Share receipt",
  reissue: "Reissue receipt",
};

export function nextStep(r: NextStepInput): NextStep | null {
  if (r.legacy_settled) return null;
  switch (r.overall_status) {
    case "AMOUNTS_PENDING": return "enter_amounts";
    case "NOT_NOTIFIED": return "remind";
    case "PROOF_PENDING": return "proof";
    case "RECEIPT_TO_REISSUE": return r.latest_receipt_id ? "reissue" : null;
    case "RECEIPT_TO_SHARE": return r.latest_receipt_id ? "share_receipt" : null;
    case "DONE": return null;
  }
  // Payment pending, part paid, overdue, challan pending: money first, then the challan.
  if (r.owes > 0) return "pay";
  if (r.pf_challan_status === "PENDING" || r.esic_challan_status === "PENDING") return "challan";
  return null;
}
