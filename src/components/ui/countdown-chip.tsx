import { CalendarClock, TriangleAlert } from "lucide-react";
import { countdown } from "@/lib/domain/countdown";
import type { ISODate } from "@/lib/format/dates";
import { cn } from "@/lib/utils";

const tones = {
  calm: "bg-neutral-soft text-neutral ring-neutral-line",
  soon: "bg-accent-soft text-accent-text ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]",
  urgent: "bg-danger-soft text-danger ring-danger-line",
  overdue: "bg-danger-soft text-danger ring-danger-line",
};

export function CountdownChip({ today, due, className }: { today: ISODate; due: ISODate; className?: string }) {
  const c = countdown(today, due);
  const Icon = c.tone === "overdue" ? TriangleAlert : CalendarClock;
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1 ring-inset transition-colors duration-500",
        tones[c.tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-4 stroke-[2]" />
      <span className="tabular">{c.label}</span>
    </span>
  );
}
