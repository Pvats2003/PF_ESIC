"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "next-themes";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark") ?? "light"}
      position="bottom-center"
      offset={88}
      mobileOffset={88}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border !border-hairline !bg-surface !text-ink !shadow-[var(--shadow-raised)] !font-sans !gap-3 !px-4 !py-3.5",
          title: "!text-sm !font-semibold",
          description: "!text-sm !text-ink-muted",
          actionButton: "!h-8 !rounded-lg !bg-primary-soft !px-3 !text-sm !font-semibold !text-primary-text",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
    />
  );
}
