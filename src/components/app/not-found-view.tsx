"use client";

import { SearchX } from "lucide-react";
import Link from "next/link";
import { useLang } from "@/components/providers/lang-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/** A wrong or old link: say so plainly and offer the two places people usually want. */
export function NotFoundView() {
  const { t } = useLang();
  return (
    <Card className="mx-auto max-w-xl">
      <EmptyState
        icon={SearchX}
        title={t("This page isn't here")}
        body={t("The link may be old, or the client was removed. Try finding them in Clients.")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild><Link href="/clients">{t("Clients")}</Link></Button>
            <Button asChild variant="secondary"><Link href="/">{t("This month")}</Link></Button>
          </div>
        }
      />
    </Card>
  );
}
