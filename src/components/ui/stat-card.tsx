import type { LucideIcon } from "lucide-react";
import { Money } from "./money";
import { cn } from "@/lib/utils";

export function StatCard({
  label, paise, count, icon: Icon, hint, tone, className,
}: {
  label: string;
  paise?: number;
  count?: number;
  icon: LucideIcon;
  hint?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "primary";
  className?: string;
}) {
  const iconTone = {
    default: "bg-surface-2 text-ink-muted",
    primary: "bg-primary-soft text-primary-text",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  }[tone ?? "default"];
  return (
    <div className={cn("card-highlight rounded-2xl bg-surface p-4", className)}>
      <div className="flex items-center gap-2">
        <span className={cn("grid size-7 place-items-center rounded-lg", iconTone)}>
          <Icon aria-hidden className="size-4 stroke-[1.75]" />
        </span>
        <span className="truncate text-sm font-medium text-ink-muted">{label}</span>
      </div>
      <div className="mt-3">
        {paise !== undefined ? (
          <Money paise={paise} size="xl" compact={Math.abs(paise) >= 1_00_000_00} />
        ) : (
          <span className="tabular text-xl font-semibold tracking-[-0.02em] text-ink">{count}</span>
        )}
      </div>
      {hint && <div className="mt-1 line-clamp-2 text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}
