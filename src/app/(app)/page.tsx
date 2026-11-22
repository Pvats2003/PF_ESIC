import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BoardSkeleton, NoDatabase } from "@/components/app/page-states";
import { BoardView } from "@/components/board/board-view";
import { getDb } from "@/lib/data/db";
import { parseMonthParam, type Board } from "@/lib/domain/board";
import { currentWageMonth } from "@/lib/format/dates";

export const metadata: Metadata = { title: "This month" };

export default function ThisMonthPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <BoardLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function BoardLoader({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await connection(); // "today" decides the default month: always render per request
  const sp = await searchParams;
  const month = parseMonthParam(sp.month) ?? currentWageMonth();
  const db = await getDb();
  if (!db) return <NoDatabase />;
  const board = await db.rpc<Board>("board", { p_month: month });
  return <BoardView key={month} board={board} />;
}
