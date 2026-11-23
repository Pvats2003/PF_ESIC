import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DetailSkeleton, NoDatabase } from "@/components/app/page-states";
import { ExportView, ReceiptRegister, ReconciliationView, ReportsHeader, SettlementView, type Recon, type RegisterRow, type Tab } from "@/components/reports/reports-view";
import { MoneyMovesPanel, type MoneyMoves } from "@/components/reports/money-moves";
import { getDb } from "@/lib/data/db";
import { parsePeriod } from "@/lib/domain/period";
import type { SettlementData } from "@/lib/domain/settlement";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ReportsLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportsLoader({ searchParams }: { searchParams: PageProps<"/reports">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const tab: Tab = (["reconcile", "settle", "receipts", "export"] as const).find((t) => t === sp.tab) ?? "reconcile";
  const { from, to } = parsePeriod(sp.from, sp.to);
  const db = await getDb();
  if (!db) return <NoDatabase />;
  const args = { p_from: from, p_to: to };
  return (
    <div className="space-y-6">
      <ReportsHeader tab={tab} from={from} to={to} />
      {tab === "reconcile" && <ReconciliationView r={await db.rpc<Recon>("reconciliation", args)} />}
      {tab === "settle" && (
        <>
          <SettlementView d={await db.rpc<SettlementData>("settlement", args)} />
          <MoneyMovesPanel moves={await db.rpc<MoneyMoves>("money_moves", args)} />
        </>
      )}
      {tab === "receipts" && <ReceiptRegister rows={await db.rpc<RegisterRow[]>("receipt_register", args)} />}
      {tab === "export" && <ExportView from={from} to={to} />}
    </div>
  );
}
