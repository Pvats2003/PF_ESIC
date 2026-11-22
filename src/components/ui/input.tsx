import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full min-w-0 rounded-xl border border-hairline-strong bg-surface text-ink placeholder:text-ink-faint " +
  "transition-[border-color,box-shadow] duration-150 outline-none " +
  "focus:border-ring focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--ring)_18%,transparent)] " +
  "aria-invalid:border-danger aria-invalid:shadow-[0_0_0_4px_color-mix(in_oklab,var(--danger)_14%,transparent)] " +
  "disabled:opacity-50";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(field, "h-11 px-3.5 text-base", className)} {...props} />;
}

/** Rupee amount field: ₹ prefix, numeric keypad on phones, right-aligned tabular digits. */
export function MoneyInput({ className, fieldSize = "md", ...props }: Omit<React.ComponentProps<"input">, "size"> & { fieldSize?: "md" | "lg" }) {
  return (
    <div className={cn("relative", className)}>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-faint",
          fieldSize === "lg" ? "text-lg" : "text-base",
        )}
      >
        ₹
      </span>
      <input
        inputMode="decimal"
        autoComplete="off"
        className={cn(
          field,
          "tabular text-right font-semibold",
          fieldSize === "lg" ? "h-14 pl-9 pr-4 text-xl" : "h-11 pl-8 pr-3.5 text-base",
        )}
        {...props}
      />
    </div>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink-muted", className)} {...props} />;
}

export function FieldHint({ className, error, ...props }: React.ComponentProps<"p"> & { error?: boolean }) {
  return <p className={cn("mt-1.5 text-xs", error ? "text-danger" : "text-ink-faint", className)} {...props} />;
}
