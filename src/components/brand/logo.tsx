import { cn } from "@/lib/utils";

/** App mark: a ledger page with a rupee, in ink indigo with a marigold rule. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-10", className)} aria-hidden>
      <rect width="48" height="48" rx="12" fill="var(--primary, #1e2a5a)" />
      <rect x="11" y="33" width="26" height="2.5" rx="1.25" fill="#e8a33d" />
      <path
        d="M17 13h15M17 18.5h15M23.5 13c4.4 0 6.5 2.5 6.5 5.5s-2.1 5.5-6.5 5.5H18l10 5.5"
        fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-9" />
      <div className="leading-tight">
        <div className="text-base font-semibold tracking-[-0.01em] text-ink">PF ESIC Desk</div>
        <div className="font-hindi text-xs text-ink-muted">पीएफ ईएसआईसी डेस्क</div>
      </div>
    </div>
  );
}
