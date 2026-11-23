"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLang } from "@/components/providers/lang-provider";
import { countdown } from "@/lib/domain/countdown";
import type { ISODate } from "@/lib/format/dates";
import { cn } from "@/lib/utils";

/**
 * Month progress ring: "29 of 38 closed" with the due-date countdown in the
 * centre. The arc fills as the month gets done; the marigold tick marks today.
 */
export function MonthProgressRing({
  closed, total, today, due, size = 184, className,
}: { closed: number; total: number; today: ISODate; due: ISODate; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = total === 0 ? 0 : Math.min(1, closed / total);
  const { lang, t } = useLang();
  const c = countdown(today, due, lang);
  const daysTone =
    c.tone === "calm" ? "text-ink" : c.tone === "soon" ? "text-accent-text" : "text-danger";
  const arcColor = pct === 1 ? "var(--success)" : "var(--primary-text)";

  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={arcColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className={cn("tabular text-2xl leading-none font-semibold tracking-[-0.03em]", daysTone)}>
          {c.days < 0 ? -c.days : c.days}
        </div>
        <div className="mt-1 text-xs font-medium text-ink-muted">
          {t(c.days < 0 ? "days overdue" : c.days === 1 ? "day left" : "days left")}
        </div>
        <div className="mt-2 h-px w-10 bg-hairline-strong" />
        <div className="tabular mt-2 text-sm font-semibold text-ink">
          {closed} <span className="font-normal text-ink-muted">{t("of {total} closed", { total })}</span>
        </div>
      </div>
      <span className="sr-only">
        {t("{closed} of {total} clients closed.", { closed, total })} {c.label}.
      </span>
    </div>
  );
}
