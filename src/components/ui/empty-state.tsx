import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon, title, body, action, className,
}: { icon: LucideIcon; title: string; body?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="relative mb-4">
        <div aria-hidden className="absolute inset-0 scale-150 rounded-full bg-accent-soft opacity-70 blur-xl" />
        <div className="relative grid size-14 place-items-center rounded-2xl bg-surface card-highlight">
          <Icon aria-hidden className="size-6 stroke-[1.5] text-accent-text" />
        </div>
      </div>
      <p className="text-base font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-[30ch] text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
