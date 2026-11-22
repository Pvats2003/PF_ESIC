import * as React from "react";
import { cn } from "@/lib/utils";

/** Wide data table: sticky header and sticky first column, hairline rows. */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="card-highlight relative w-full overflow-auto rounded-2xl bg-surface">
      <table className={cn("w-full border-separate border-spacing-0 text-sm", className)} {...props} />
    </div>
  );
}
export function THead(props: React.ComponentProps<"thead">) {
  return <thead {...props} />;
}
export function TBody(props: React.ComponentProps<"tbody">) {
  return <tbody className="[&>tr:hover>td]:bg-surface-2/60" {...props} />;
}
export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("[&>td]:border-b [&>td]:border-hairline last:[&>td]:border-b-0", className)} {...props} />;
}
export function TH({ className, numeric, sticky, ...props }: React.ComponentProps<"th"> & { numeric?: boolean; sticky?: boolean }) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 h-10 border-b border-hairline bg-surface-2 px-4 text-xs font-semibold tracking-wide whitespace-nowrap text-ink-muted uppercase",
        numeric ? "text-right" : "text-left",
        sticky && "left-0 z-20",
        className,
      )}
      {...props}
    />
  );
}
export function TD({ className, numeric, sticky, ...props }: React.ComponentProps<"td"> & { numeric?: boolean; sticky?: boolean }) {
  return (
    <td
      className={cn(
        "h-12 bg-surface px-4 whitespace-nowrap text-ink",
        numeric && "tabular text-right",
        sticky && "sticky left-0 z-[5] font-medium",
        className,
      )}
      {...props}
    />
  );
}
export function TFootRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("[&>td]:border-t [&>td]:border-hairline-strong [&>td]:bg-surface-2 [&>td]:font-semibold", className)} {...props} />;
}
