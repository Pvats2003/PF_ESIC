"use client";

import { ArrowRight, CalendarPlus, FileCheck2, Keyboard, Languages, MessageCircle, Phone, Search, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useLang } from "@/components/providers/lang-provider";
import { Card } from "@/components/ui/card";

const STEPS: Array<{ icon: LucideIcon; title: string; body: string; href: string; go: string }> = [
  { icon: CalendarPlus, title: "Start the month", body: "On This month, press Start. Every active client is added with their usual fee.", href: "/", go: "Open This month" },
  { icon: Keyboard, title: "Type PF and ESIC", body: "In Fast entry, type each client's PF and ESIC in one list. Enter moves down; it saves by itself.", href: "/entry", go: "Open Fast entry" },
  { icon: MessageCircle, title: "Send reminders", body: "Press Send reminder next to a client. The WhatsApp message is written for you; check it and send.", href: "/queue", go: "Open Today" },
  { icon: Wallet, title: "Record the payment", body: "When money comes, press Record payment. A receipt is made at once; share it on WhatsApp.", href: "/", go: "Open This month" },
  { icon: FileCheck2, title: "Add the challan", body: "After paying the challan, press Add challan and type the TRRN. The app offers to tell the client.", href: "/queue", go: "Open Today" },
];

const TIPS: Array<{ icon: LucideIcon; text: string }> = [
  { icon: ArrowRight, text: "Not sure what to do? Every client has a Next step button, and Today lists everything in order." },
  { icon: Phone, text: "The phone button next to a client lets you call, open WhatsApp, or send any ready message." },
  { icon: Search, text: "Find any client fast: press Ctrl K on the computer, or the Clients tab on the phone. Old spellings work too." },
  { icon: Languages, text: "Switch the screens between Hindi and English with the language button at the top." },
];

/** The monthly routine in five plain steps, for anyone new to the app. */
export function HelpView() {
  const { t } = useLang();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{t("How it works")}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t("Your month in five steps. Do them in order; the app keeps track of the rest.")}</p>
      </div>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <Card className="flex items-start gap-4 p-5">
              <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-text">
                <s.icon className="size-5" />
                <span className="tabular absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-ink">{i + 1}</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t(s.title)}</div>
                <p className="mt-0.5 text-sm text-ink-muted">{t(s.body)}</p>
                <Link href={s.href} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary-text hover:underline">{t(s.go)}<ArrowRight className="size-4" /></Link>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <Card className="p-5">
        <div className="mb-3 font-semibold">{t("Good to know")}</div>
        <ul className="space-y-3">
          {TIPS.map((tip) => (
            <li key={tip.text} className="flex gap-3 text-sm">
              <tip.icon className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <span>{t(tip.text)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
