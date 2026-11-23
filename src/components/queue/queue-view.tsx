"use client";

import { ArrowRight, CheckCheck, ChevronRight, FileCheck2, Keyboard, MessageCircle, Phone, Receipt, ShieldCheck, SkipForward, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RowReminder } from "@/components/board/board-view";
import { useLang } from "@/components/providers/lang-provider";
import { WalkInButton } from "@/components/walkin/walk-in-sheet";
import { ChallanSheet, VerifyChallanSheet, type ChallanMonth } from "@/components/challan/challan-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { ClientPaysChip } from "@/components/ui/status-chip";
import type { Board, BoardRow } from "@/lib/domain/board";
import { buildQueue, QUEUE_LABELS, type QueueItem, type QueueKind } from "@/lib/domain/queue";
import { formatMonth } from "@/lib/format/dates";
import { cn } from "@/lib/utils";

const ICONS: Record<QueueKind, LucideIcon> = { overdue: TriangleAlert, remind: MessageCircle, file_challan: FileCheck2, proof: ShieldCheck, share_receipt: Receipt };
const TONE: Record<QueueKind, string> = {
  overdue: "bg-danger-soft text-danger", remind: "bg-warning-soft text-warning", file_challan: "bg-primary-soft text-primary-text",
  proof: "bg-info-soft text-info", share_receipt: "bg-success-soft text-success",
};

/** Today's queue: one client at a time, most urgent first. "Done → next" after each action. */
export function QueueView({ boards }: { boards: Board[] }) {
  const rows = useMemo(() => boards.flatMap((b) => b.rows), [boards]);
  const partners = boards.find((b) => b.partners)?.partners ?? [];
  const { items, counts, amountsPending } = useMemo(() => buildQueue(rows), [rows]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [only, setOnly] = useState<QueueKind | null>(null);
  const [sheet, setSheet] = useState<"act" | null>(null);
  const reduce = useReducedMotion();
  const { t, lang } = useLang();

  const open = items.filter((i) => !done.has(i.row.monthly_record_id + i.kind) && (!only || i.kind === only));
  const current = open[0];
  const next = () => current && setDone((d) => new Set(d).add(current.row.monthly_record_id + current.kind));
  const currentMonth = boards[0]?.month;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Phone: the current client first, categories below. Desktop: categories on the left. */}
      <aside className="order-2 space-y-3 lg:order-1">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{t("Today")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{items.length ? t("{n} things to do, most urgent first.", { n: items.length - done.size }) : t("Nothing waiting.")}</p>
        </div>
        <WalkInButton variant="soft" />
        <Card className="overflow-hidden">
          <ul className="divide-y divide-hairline">
            {(Object.keys(QUEUE_LABELS) as QueueKind[]).map((k) => {
              const Icon = ICONS[k];
              return (
                <li key={k}>
                  <button
                    onClick={() => setOnly(only === k ? null : k)}
                    aria-pressed={only === k}
                    className={cn("flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm transition-colors hover:bg-surface-2/60", only === k && "bg-primary-soft")}
                  >
                    <span className={cn("grid size-7 place-items-center rounded-lg", TONE[k])}><Icon className="size-4" /></span>
                    <span className="flex-1 font-medium">{t(QUEUE_LABELS[k].title)}</span>
                    <span className="tabular rounded-full bg-surface-2 px-2 text-xs font-semibold">{counts[k]}</span>
                  </button>
                </li>
              );
            })}
            {amountsPending > 0 && currentMonth && (
              <li>
                <Link href={`/entry?month=${currentMonth.slice(0, 7)}`} className="flex min-h-12 items-center gap-3 px-4 text-sm hover:bg-surface-2/60">
                  <span className="grid size-7 place-items-center rounded-lg bg-neutral-soft text-neutral"><Keyboard className="size-4" /></span>
                  <span className="flex-1 font-medium">{t("Enter PF/ESIC")}</span>
                  <span className="tabular rounded-full bg-surface-2 px-2 text-xs font-semibold">{amountsPending}</span>
                  <ChevronRight className="size-4 text-ink-faint" />
                </Link>
              </li>
            )}
          </ul>
        </Card>
      </aside>

      <section aria-live="polite" className="order-1 lg:order-2">
        {!current ? (
          <Card>
            <EmptyState
              icon={CheckCheck}
              title={items.length ? t("All done for now 🎉") : t("Nothing in today's queue")}
              body={amountsPending ? t("{n} clients still need PF/ESIC amounts.", { n: amountsPending }) : t("Reminders, challans and receipts are all up to date.")}
              action={amountsPending && currentMonth ? <Button asChild variant="soft"><Link href={`/entry?month=${currentMonth.slice(0, 7)}`}><Keyboard />{t("Enter PF/ESIC")}</Link></Button> : undefined}
            />
          </Card>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-sm text-ink-muted">
              <span>{only ? t("{n} left in {list}", { n: open.length, list: lang === "hi" ? t(QUEUE_LABELS[only].title) : QUEUE_LABELS[only].title.toLowerCase() }) : t("{n} left", { n: open.length })}</span>
              <Button variant="ghost" size="sm" onClick={next}><SkipForward />{t("Skip")}</Button>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={current.row.monthly_record_id + current.kind}
                initial={reduce ? false : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? undefined : { opacity: 0, x: -24 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <QueueCard item={current} onAct={() => setSheet("act")} />
              </motion.div>
            </AnimatePresence>
            {open.length > 1 && (
              <Card className="mt-4 overflow-hidden">
                <div className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{t("Up next")}</div>
                <ul className="divide-y divide-hairline">
                  {open.slice(1, 6).map((i) => (
                    <li key={i.row.monthly_record_id + i.kind} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className={cn("grid size-6 place-items-center rounded-md", TONE[i.kind])}>{(() => { const I = ICONS[i.kind]; return <I className="size-3.5" />; })()}</span>
                      <span className="flex-1 truncate">{i.row.firm_name}</span>
                      <span className="text-xs text-ink-faint">{formatMonth(i.row.wage_month, lang)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {sheet && <QueueAction item={current} partners={partners} onClose={() => setSheet(null)} onDone={() => { setSheet(null); next(); }} />}
          </>
        )}
      </section>
    </div>
  );
}

function QueueCard({ item, onAct }: { item: QueueItem; onAct: () => void }) {
  const r = item.row;
  const L = QUEUE_LABELS[item.kind];
  const Icon = ICONS[item.kind];
  const phone = r.whatsapp_phone ?? r.phone;
  const { t, lang } = useLang();
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", TONE[item.kind])}><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink-muted">{t(L.title)} · {formatMonth(r.wage_month, lang)}</div>
          <Link href={`/clients/${r.client_id}`} className="mt-0.5 block text-xl font-semibold tracking-[-0.02em] hover:text-primary-text">{r.firm_name}</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            {r.owner_name ?? t("Owner not added")}
            {r.challan_payer === "client" && <ClientPaysChip />}
          </div>
          <p className="mt-3 text-sm">{t(L.why(r))}</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-4 text-sm">
        <div><dt className="text-ink-muted">PF + ESIC</dt><dd><Money paise={(r.pf_paise ?? 0) + (r.esic_paise ?? 0)} size="md" /></dd></div>
        <div><dt className="text-ink-muted">{t("Received")}</dt><dd><Money paise={r.received} size="md" tone={r.received ? "success" : "muted"} /></dd></div>
        <div><dt className="text-ink-muted">{t("Owes")}</dt><dd><Money paise={r.owes} size="md" tone={r.owes ? (r.overdue ? "danger" : "warning") : "muted"} /></dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        {item.kind === "share_receipt" && r.latest_receipt_id ? (
          <Button asChild size="lg" className="flex-1"><Link href={`/receipts/${r.latest_receipt_id}`}><Receipt />{t(L.action)}<ArrowRight /></Link></Button>
        ) : (
          <Button size="lg" className="flex-1" onClick={onAct}>{(() => { const I = ICONS[item.kind]; return <I />; })()}{t(L.action)}</Button>
        )}
        {phone && <Button asChild variant="secondary" size="lg"><a href={`tel:${phone}`}><Phone />{t("Call")}</a></Button>}
      </div>
    </Card>
  );
}

function QueueAction({ item, partners, onClose, onDone }: { item: QueueItem; partners: NonNullable<Board["partners"]>; onClose: () => void; onDone: () => void }) {
  const r: BoardRow = item.row;
  const cm: ChallanMonth = { monthly_record_id: r.monthly_record_id, client_id: r.client_id, wage_month: r.wage_month, challan_payer: r.challan_payer, pf_paise: r.pf_paise, esic_paise: r.esic_paise, challans: r.challans };
  if (item.kind === "overdue" || item.kind === "remind") return <RowReminder row={r} onClose={onClose} onSent={onDone} />;
  if (item.kind === "file_challan") {
    return <ChallanSheet month={cm} partners={partners} initialType={r.pf_challan_status === "PENDING" ? "pf" : "esic"} open onOpenChange={(o) => !o && onClose()} />;
  }
  if (item.kind === "proof") {
    const c = (r.challans ?? []).find((x) => x.paid_by === "client" && !x.verified);
    if (c) return <VerifyChallanSheet month={cm} challan={c} open onOpenChange={(o) => !o && onClose()} />;
    return <ChallanSheet month={cm} partners={partners} open onOpenChange={(o) => !o && onClose()} />;
  }
  return null;
}
