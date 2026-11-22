"use client";

import { CalendarRange, Keyboard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "This month", icon: CalendarRange, match: (p: string) => p === "/" },
  { href: "/entry", label: "Fast entry", icon: Keyboard, match: (p: string) => p.startsWith("/entry") },
  { href: "/clients", label: "Clients", icon: Users, match: (p: string) => p.startsWith("/clients") },
] as const;

/** Highlights the current page. Reads the URL, so it renders inside <Suspense> (see AppShell). */
export function SidebarNav() {
  return <SidebarLinks path={usePathname()} />;
}

/** Same links without a highlight: shown for the instant before the URL is known. */
export function SidebarLinks({ path = "" }: { path?: string }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon, match }) => {
        const active = match(path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
              active ? "bg-primary-soft text-primary-text" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon aria-hidden className="size-[18px] stroke-[1.75]" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomTabs() {
  return <BottomTabLinks path={usePathname()} />;
}

export function BottomTabLinks({ path = "" }: { path?: string }) {
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-md">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium", active ? "text-primary-text" : "text-ink-muted")}
            >
              <Icon aria-hidden className={cn("size-[22px] stroke-[1.75]", active && "stroke-[2]")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
