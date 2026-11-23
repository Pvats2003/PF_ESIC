import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DetailSkeleton, NoDatabase } from "@/components/app/page-states";
import type { StatementData } from "@/components/statement/statement";
import { StatementView } from "@/components/statement/statement-view";
import { getDb } from "@/lib/data/db";
import { financialYear, todayIST } from "@/lib/format/dates";

export const metadata: Metadata = { title: "Statement" };

export default function StatementPage({ params, searchParams }: PageProps<"/clients/[id]/statement">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <StatementLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function StatementLoader({ params, searchParams }: Pick<PageProps<"/clients/[id]/statement">, "params" | "searchParams">) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const current = financialYear(todayIST());
  const fy = typeof sp.fy === "string" && /^\d{4}-\d{2}$/.test(sp.fy) ? sp.fy : current;
  const start = Number(fy.slice(0, 4));
  const db = await getDb();
  if (!db) return <NoDatabase />;
  const d = await db.rpc<StatementData>("client_statement", { p_client_id: id, p_from: `${start}-04-01`, p_to: `${start + 1}-03-31` });
  if (!d?.client) notFound();
  const first = Number(current.slice(0, 4));
  const years = [first, first - 1, first - 2].map((y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  return <StatementView key={`${fy}`} d={d} years={years} fy={fy} />;
}
