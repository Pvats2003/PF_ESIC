"use client";

import { DatabaseZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/components/providers/lang-provider";

export function NoDatabase() {
  const { t } = useLang();
  return (
    <Card>
      <EmptyState icon={DatabaseZap} title={t("No database connected")} body={t("This demo has no data source. Sign in on the live site, or run the local database (npm run dev:db).")} />
    </Card>
  );
}

export function BoardSkeleton() {
  const { t } = useLang();
  return (
    <div aria-busy="true" aria-label={t("Loading")}>
      <div className="flex items-end justify-between">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-9 w-48 rounded-full" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[260px_1fr]">
        <Skeleton className="h-[230px] rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[108px] rounded-2xl" />)}
        </div>
      </div>
      <Skeleton className="mt-8 h-9 w-full max-w-2xl rounded-full" />
      <div className="mt-4 space-y-px overflow-hidden rounded-2xl">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-14 rounded-none" />)}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  const { t } = useLang();
  return (
    <div aria-busy="true" aria-label={t("Loading")} className="space-y-4">
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
