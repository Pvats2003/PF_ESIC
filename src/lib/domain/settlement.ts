/**
 * Partner settlement arithmetic (pure, unit-tested). Figures come from the
 * settlement() database function.
 *
 *   pool          = fees received − shared expenses
 *   share(P)      = pool × P's split %           (rounded to paise; remainder to the first partner)
 *   holding(P)    = fees P received − expenses P paid + settlement transfers P received − paid
 *   position(P)   = holding(P) − share(P)        (> 0: P holds more than their share and pays the other)
 */
export interface SettlementPartner {
  id: string;
  code: "A" | "R";
  name: string;
  fees_received: number;
  expenses_paid: number;
  transfers_net: number;
  earned_as_handler: number;
  share_percent: number;
  gov_held: number;
}
export interface SettlementData {
  from: string;
  to: string;
  partners: SettlementPartner[];
  fees_no_handler: number;
  expenses_unassigned: number;
  split_from: string | null;
}

export interface SettlementResult {
  pool: number;
  rows: Array<SettlementPartner & { share: number; holding: number; position: number }>;
  payer: SettlementPartner | null;
  payee: SettlementPartner | null;
  amount: number;
  splitOk: boolean;
}

export function computeSettlement(d: SettlementData): SettlementResult {
  const fees = d.partners.reduce((a, p) => a + p.fees_received, 0);
  const expenses = d.partners.reduce((a, p) => a + p.expenses_paid, 0) + d.expenses_unassigned;
  const pool = fees - expenses;
  const pctTotal = d.partners.reduce((a, p) => a + Number(p.share_percent), 0);
  const shares = d.partners.map((p) => Math.floor((pool * Number(p.share_percent)) / 100));
  if (shares.length) shares[0] += pool - shares.reduce((a, b) => a + b, 0); // exact total, no paise lost
  const rows = d.partners.map((p, i) => {
    const holding = p.fees_received - p.expenses_paid + p.transfers_net;
    return { ...p, share: shares[i], holding, position: holding - shares[i] };
  });
  const payerRow = rows.filter((r) => r.position > 0).sort((a, b) => b.position - a.position)[0] ?? null;
  const payeeRow = rows.filter((r) => r.position < 0).sort((a, b) => a.position - b.position)[0] ?? null;
  return {
    pool,
    rows,
    payer: payerRow,
    payee: payeeRow,
    amount: payerRow && payeeRow ? Math.min(payerRow.position, -payeeRow.position) : 0,
    splitOk: pctTotal === 100,
  };
}
