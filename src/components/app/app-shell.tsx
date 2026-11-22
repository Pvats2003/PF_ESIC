import { LogOut } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import { BottomTabLinks, BottomTabs, SidebarLinks, SidebarNav } from "./nav";
import { ThemeToggle } from "./theme-toggle";

/** Desktop: collapsible-width sidebar. Phone: top bar + bottom tabs. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-[248px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-hairline bg-surface px-4 py-5 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <LogoMark className="size-9" />
          <span className="leading-tight">
            <span className="block text-base font-semibold tracking-[-0.01em]">PF ESIC Desk</span>
            <span className="font-hindi block text-xs text-ink-muted">पीएफ ईएसआईसी डेस्क</span>
          </span>
        </Link>
        <Suspense fallback={<SidebarLinks />}>
          <SidebarNav />
        </Suspense>
        <div className="mt-auto flex items-center justify-between border-t border-hairline pt-4">
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="sm" type="submit"><LogOut />Sign out</Button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-hairline bg-paper/90 px-4 backdrop-blur-md lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="size-8" />
          <span className="text-base font-semibold">PF ESIC Desk</span>
        </Link>
        <div className="flex items-center">
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="icon" type="submit" aria-label="Sign out"><LogOut /></Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">{children}</main>
      <Suspense fallback={<BottomTabLinks />}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}
