"use client";

import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet for forms and actions (thumb-reachable on phones).
 * On wide screens it becomes a right-side panel.
 */
export function BottomSheet({
  open, onOpenChange, title, description, children, footer, trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  trigger?: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-[rgb(14_17_22/0.42)] backdrop-blur-[2px]" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[20px] bg-surface outline-none",
            "shadow-[var(--shadow-sheet)] md:inset-x-auto md:right-4 md:bottom-4 md:w-[440px] md:rounded-[20px]",
          )}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-hairline-strong md:hidden" />
          <div className="px-5 pt-4 pb-2">
            <Drawer.Title className="text-lg font-semibold text-ink">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-0.5 text-sm text-ink-muted">{description}</Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && <div className="safe-bottom border-t border-hairline px-5 pt-3 pb-4">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
