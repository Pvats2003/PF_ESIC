import { BarChart3, ChevronRight, Keyboard, LogOut, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Card } from "@/components/ui/card";
import { WalkInButton } from "@/components/walkin/walk-in-sheet";

export const metadata: Metadata = { title: "More" };

const LINKS = [
  { href: "/entry", label: "Fast entry", hint: "Type PF and ESIC for every client", icon: Keyboard },
  { href: "/reports", label: "Reports", hint: "Reconciliation, settlement, receipts, Excel", icon: BarChart3 },
  { href: "/settings", label: "Settings", hint: "Business details, messages, split", icon: Settings },
];

export default function MorePage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">More</h1>
        <WalkInButton variant="primary" />
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-hairline">
          {LINKS.map(({ href, label, hint, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-16 items-center gap-3 px-4 hover:bg-surface-2/60">
                <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary-text"><Icon className="size-[18px]" /></span>
                <span className="flex-1"><span className="block font-semibold">{label}</span><span className="block text-sm text-ink-muted">{hint}</span></span>
                <ChevronRight className="size-4 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex items-center justify-between px-4 py-2">
        <span className="text-sm font-medium">Light / dark</span>
        <ThemeToggle />
      </Card>
      <form action="/auth/signout" method="post">
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface text-sm font-semibold text-danger ring-1 ring-hairline"><LogOut className="size-4" />Sign out</button>
      </form>
    </div>
  );
}
