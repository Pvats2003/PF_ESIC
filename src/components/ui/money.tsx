import { formatINR, formatINRCompact, type Paise } from "@/lib/format/money";
import { cn } from "@/lib/utils";

const sizes = {
  sm: "text-sm font-medium",
  md: "text-base font-semibold",
  lg: "text-lg font-semibold",
  xl: "text-xl font-semibold tracking-[-0.02em]",
  hero: "text-2xl font-semibold tracking-[-0.035em]",
} as const;

/**
 * Every rupee amount in the app goes through this: tabular figures, Indian
 * grouping, and a muted ₹ sign so the digits carry the weight.
 */
export function Money({
  paise, size = "md", compact = false, tone, className, muteSymbol = true,
}: {
  paise: Paise;
  size?: keyof typeof sizes;
  compact?: boolean;
  tone?: "default" | "muted" | "primary" | "success" | "danger" | "warning";
  className?: string;
  muteSymbol?: boolean;
}) {
  const text = compact ? formatINRCompact(paise) : formatINR(paise);
  const negative = text.startsWith("−");
  const body = text.replace(/^−?₹/, "");
  const toneClass = {
    default: "text-ink",
    muted: "text-ink-muted",
    primary: "text-primary-text",
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
  }[tone ?? "default"];
  return (
    <span className={cn("tabular whitespace-nowrap", sizes[size], toneClass, className)}>
      {negative && "−"}
      <span className={cn(muteSymbol && "font-normal opacity-55", size === "hero" && "mr-0.5 text-[0.6em] align-[0.38em]")}>₹</span>
      {body}
    </span>
  );
}

/** Small muted label above a big number: the "hero number" pattern. */
export function Figure({
  label, paise, size = "xl", tone, sub, className,
}: {
  label: string;
  paise: Paise;
  size?: "lg" | "xl" | "hero";
  tone?: React.ComponentProps<typeof Money>["tone"];
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</div>
      <Money paise={paise} size={size} tone={tone} className="mt-1 block" />
      {sub && <div className="mt-1 text-xs text-ink-faint">{sub}</div>}
    </div>
  );
}
