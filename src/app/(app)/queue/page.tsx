import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DetailSkeleton, NoDatabase } from "@/components/app/page-states";
import { QueueView } from "@/components/queue/queue-view";
import { getDb } from "@/lib/data/db";
import type { Board } from "@/lib/domain/board";
import { addMonths, currentWageMonth } from "@/lib/format/dates";

export const metadata: Metadata = { title: "Today" };

export default function QueuePage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <QueueLoader />
    </Suspense>
  );
}

async function QueueLoader() {
  await connection(); // depends on today's date
  const db = await getDb();
  if (!db) return <NoDatabase />;
  const month = currentWageMonth();
  const [current, previous] = await Promise.all([
    db.rpc<Board>("board", { p_month: month }),
    db.rpc<Board>("board", { p_month: addMonths(month, -1) }),
  ]);
  return <QueueView boards={[current, previous]} />;
}
