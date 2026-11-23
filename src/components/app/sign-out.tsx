"use client";

import { LogOut } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { Button } from "@/components/ui/button";

export function SignOutButton({ compact }: { compact?: boolean }) {
  const { t } = useLang();
  return (
    <form action="/auth/signout" method="post">
      {compact
        ? <Button variant="ghost" size="icon" type="submit" aria-label={t("Sign out")}><LogOut /></Button>
        : <Button variant="ghost" size="sm" type="submit"><LogOut />{t("Sign out")}</Button>}
    </form>
  );
}
