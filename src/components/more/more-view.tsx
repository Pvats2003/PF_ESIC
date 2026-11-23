"use client";

import { BarChart3, ChevronRight, Keyboard, LogOut, Phone, Settings } from "lucide-react";
import Link from "next/link";
import { LanguageChoice } from "@/components/app/language-toggle";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { useLang } from "@/components/providers/lang-provider";
import { Card } from "@/components/ui/card";
import { WalkInButton } from "@/components/walkin/walk-in-sheet";

const LINKS = [
  { href: "/entry", label: "Fast entry", hint: "Type PF and ESIC for every client", icon: Keyboard },
  { href: "/clients/phones", label: "Client phones", hint: "Type every client's phone and WhatsApp in one list", icon: Phone },
  { href: "/reports", label: "Reports", hint: "Reconciliation, settlement, receipts, Excel", icon: BarChart3 },
  { href: "/settings", label: "Settings", hint: "Business details, messages, split", icon: Settings },
];

export function MoreView() {
  const { t } = useLang();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{t("More")}</h1>
        <WalkInButton variant="primary" />
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-hairline">
          {LINKS.map(({ href, label, hint, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-16 items-center gap-3 px-4 hover:bg-surface-2/60">
                <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary-text"><Icon className="size-[18px]" /></span>
                <span className="flex-1"><span className="block font-semibold">{t(label)}</span><span className="block text-sm text-ink-muted">{t(hint)}</span></span>
                <ChevronRight className="size-4 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-sm font-medium">{t("Screen language")}</span>
        <LanguageChoice />
      </Card>
      <Card className="flex items-center justify-between px-4 py-2">
        <span className="text-sm font-medium">{t("Light / dark")}</span>
        <ThemeToggle />
      </Card>
      <form action="/auth/signout" method="post">
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface text-sm font-semibold text-danger ring-1 ring-hairline"><LogOut className="size-4" />{t("Sign out")}</button>
      </form>
    </div>
  );
}
