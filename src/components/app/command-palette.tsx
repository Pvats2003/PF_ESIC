"use client";

import { Command } from "cmdk";
import { Phone, BarChart3, CalendarPlus, CalendarRange, FileSpreadsheet, Keyboard, ListTodo, Search, Settings, UserRound, UserRoundPlus, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSearchIndex, startMonth, type SearchClient } from "@/app/(app)/actions";
import { RecordPaymentSheet } from "@/components/payment/record-payment-sheet";
import { WalkInSheet } from "@/components/walkin/walk-in-sheet";
import { currentWageMonth, formatMonth } from "@/lib/format/dates";
import { formatINR } from "@/lib/format/money";
import { useLang } from "@/components/providers/lang-provider";

export const OPEN_PALETTE_EVENT = "pfesic:open-palette";

const PAGES: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "This month", icon: CalendarRange },
  { href: "/queue", label: "Today's queue", icon: ListTodo },
  { href: "/entry", label: "Enter PF/ESIC", icon: Keyboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/clients/phones", label: "Client phones", icon: Phone },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** ⌘K / Ctrl+K: jump to any client by any spelling, any page, or start an action. */
export function CommandPalette() {
  const { t, lang } = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<SearchClient[] | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [walkIn, setWalkIn] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open || clients) return;
    getSearchIndex().then((r) => (r.ok ? setClients(r.data) : toast.error(t("Couldn't load clients"), { description: t(r.error) })));
  }, [open, clients, t]);

  const go = useCallback((fn: () => void) => { setOpen(false); fn(); }, []);
  // Today's date is only read once opened (the shell itself is prerendered).
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setMonth(currentWageMonth());
  }, [open]);

  return (
    <>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label={t("Search and actions")}
        overlayClassName="fixed inset-0 z-40 bg-[rgb(14_17_22/0.42)] backdrop-blur-[2px]"
        contentClassName="fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-raised)] ring-1 ring-hairline"
      >
        <div className="flex items-center gap-3 border-b border-hairline px-4">
          <Search aria-hidden className="size-5 text-ink-faint" />
          <Command.Input placeholder={t("Client (any spelling), page or action…")} className="h-14 w-full bg-transparent text-base outline-none placeholder:text-ink-faint" />
          <kbd className="hidden rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-ink-muted sm:block">{t("Esc")}</kbd>
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-muted [&_[cmdk-group-heading]]:uppercase">
          <Command.Empty className="px-3 py-8 text-center text-sm text-ink-muted">{t("Nothing matches. Try part of the name or an old spelling.")}</Command.Empty>
          <Command.Group heading={t("Actions")}>
            {month && <>
            <Item icon={UserRoundPlus} onSelect={() => go(() => setWalkIn(true))} keywords={["claim", "registration", "letter", "walkin"]}>{t("Walk-in work")}</Item>
            <Item icon={CalendarPlus} onSelect={() => go(async () => {
              const r = await startMonth(month);
              if (!r.ok) return void toast.error(t("Couldn't start the month"), { description: t(r.error) });
              toast.success(r.data ? t("{month} started for {n} clients", { month: formatMonth(month, lang), n: r.data }) : t("{month} is already started", { month: formatMonth(month, lang) }));
              router.refresh();
            })}>{t("Start {month}", { month: formatMonth(month, lang) })}</Item>
            <Item icon={FileSpreadsheet} onSelect={() => go(() => { Object.assign(document.createElement("a"), { href: `/reports/export?from=${month.slice(0, 7)}&to=${month.slice(0, 7)}`, download: "" }).click(); })} keywords={["excel", "backup", "download"]}>{t("Export {month} to Excel", { month: formatMonth(month, lang) })}</Item>
            </>}
          </Command.Group>
          <Command.Group heading={t("Go to")}>
            {PAGES.map((p) => <Item key={p.href} value={p.label} keywords={[t(p.label)]} icon={p.icon} onSelect={() => go(() => router.push(p.href))}>{t(p.label)}</Item>)}
          </Command.Group>
          <Command.Group heading={t("Clients")}>
            {!clients && <div className="px-3 py-2 text-sm text-ink-faint">{t("Loading clients…")}</div>}
            {clients?.map((c) => (
              <Item key={c.id} value={`client ${c.firm_name} ${c.id}`} keywords={[...c.aliases, c.owner_name ?? ""]} icon={UserRound} onSelect={() => go(() => router.push(`/clients/${c.id}`))}
                hint={c.owes ? t("owes {amount}", { amount: formatINR(c.owes) }) : c.kind === "occasional" ? t("walk-in") : !c.active ? t("archived") : undefined}>
                {c.firm_name}
              </Item>
            ))}
          </Command.Group>
          {clients && (
            <Command.Group heading={t("Record payment")}>
              {clients.filter((c) => c.owes > 0).map((c) => (
                <Item key={`pay-${c.id}`} value={`pay ${c.firm_name} ${c.id}`} keywords={["payment", "record", ...c.aliases]} icon={Wallet} onSelect={() => go(() => setPayFor(c.id))} hint={formatINR(c.owes)}>
                  {t("Record payment for {name}", { name: c.firm_name })}
                </Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command.Dialog>
      {payFor && <RecordPaymentSheet clientId={payFor} open onOpenChange={(o) => !o && setPayFor(null)} />}
      {walkIn && <WalkInSheet open onOpenChange={setWalkIn} />}
    </>
  );
}

function Item({ children, icon: Icon, onSelect, value, keywords, hint }: { children: React.ReactNode; icon: LucideIcon; onSelect: () => void; value?: string; keywords?: string[]; hint?: string }) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-ink data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-text"
    >
      <Icon aria-hidden className="size-[18px] shrink-0 stroke-[1.75] text-ink-muted" />
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="tabular shrink-0 text-xs text-ink-faint">{hint}</span>}
    </Command.Item>
  );
}

export function SearchButton() {
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
      className="mb-4 flex h-10 w-full items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm text-ink-muted ring-1 ring-hairline hover:text-ink"
    >
      <Search className="size-4" />
      <span className="flex-1 text-left">{t("Search")}</span>
      <kbd className="rounded-md bg-surface px-1.5 py-0.5 text-xs">{t("Ctrl K")}</kbd>
    </button>
  );
}
