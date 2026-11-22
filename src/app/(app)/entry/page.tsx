import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BoardSkeleton, NoDatabase } from "@/components/app/page-states";
import { EntrySheet } from "@/components/entry/entry-sheet";
import { getDb } from "@/lib/data/db";
import { parseMonthParam, type Board } from "@/lib/domain/board";
import { currentWageMonth } from "@/lib/format/dates";

export const metadata: Metadata = { title: "Fast entry" };

export default function EntryPage({ searchParams }: PageProps<"/entry">) {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <EntryLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function EntryLoader({ searchParams }: { searchParams: PageProps<"/entry">["searchParams"] }) {
  await connection(); // "today" decides the default month: always render per request
  const sp = await searchParams;
  const month = parseMonthParam(sp.month) ?? currentWageMonth();
  const db = await getDb();
  if (!db) return <NoDatabase />;
  return <EntrySheet key={month} board={await db.rpc<Board>("board", { p_month: month })} />;
}
