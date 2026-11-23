"use client";

import { ArrowRight, BadgeCheck, CircleHelp, PhoneCall, X, BadgeIndianRupee, ChevronLeft, ChevronRight, FileCheck2, Keyboard, Landmark, PartyPopper, Plus, Search, Send, ShieldAlert, Wallet, CalendarPlus } from "lucide-react";
import { motion, useReducedMotion, type PanInfo } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { startMonth } from "@/app/(app)/actions";
import { challanFigures, ContactSheet, type ContactTarget } from "@/components/messages/contact-sheet";
import { ReminderSheet } from "@/components/messages/reminder-sheet";
import { RecordPaymentSheet } from "@/components/payment/record-payment-sheet";
import { useLang } from "@/components/providers/lang-provider";
import { WalkInButton } from "@/components/walkin/walk-in-sheet";
import { ChallanSheet, VerifyChallanSheet, type ChallanMonth } from "@/components/challan/challan-sheet";
import { NextStepButton, type NextStepHandlers } from "./next-step-button";
import { nextStep } from "@/lib/domain/next-step";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountdownChip } from "@/components/ui/countdown-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { MonthProgressRing } from "@/components/ui/progress-ring";
import { StatCard } from "@/components/ui/stat-card";
import { Chip, ClientPaysChip, StatusChip, type RecordStatus } from "@/components/ui/status-chip";
import { FILTERS, matchesFilter, matchesSearch, summarize, type Board, type BoardRow, type FilterId } from "@/lib/domain/board";
import { addMonths, dueDateFor, formatMonth } from "@/lib/format/dates";
import { cn } from "@/lib/utils";

const monthParam = (iso: string) => iso.slice(0, 7);

export function BoardView({ board }: { board: Board }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [remindFor, setRemindFor] = useState<BoardRow | null>(null);
  const [contactFor, setContactFor] = useState<BoardRow | null>(null);
  const [challanFor, setChallanFor] = useState<BoardRow | null>(null);
  const [proofFor, setProofFor] = useState<BoardRow | null>(null);
  const handlers = (r: BoardRow): NextStepHandlers => ({
    onPay: () => setPayFor(r.client_id), onRemind: () => setRemindFor(r), onChallan: () => setChallanFor(r), onProof: () => setProofFor(r),
  });
  const s = useMemo(() => summarize(board.rows), [board.rows]);
  const due = board.rows[0]?.due_date ?? dueDateFor(board.month, board.due_day);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, board.rows.filter((r) => matchesFilter(r, f.id)).length])), [board.rows]);
  const rows = useMemo(() => board.rows.filter((r) => matchesFilter(r, filter) && matchesSearch(r, query)), [board.rows, filter, query]);
  const { lang, t } = useLang();
  const monthName = formatMonth(board.month, lang).split(" ")[0];

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium tracking-wide text-ink-muted uppercase">{t("Wage month")}</div>
          <div className="mt-1 flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label={t("Previous month")}><Link href={`/?month=${monthParam(addMonths(board.month, -1))}`}><ChevronLeft /></Link></Button>
            <h1 className="min-w-[200px] text-center text-xl font-semibold tracking-[-0.02em] sm:min-w-[230px]">{formatMonth(board.month, lang)}</h1>
            <Button asChild variant="ghost" size="icon" aria-label={t("Next month")}><Link href={`/?month=${monthParam(addMonths(board.month, 1))}`}><ChevronRight /></Link></Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CountdownChip today={board.today} due={due} />
          {board.rows.length > 0 && (
            <Button asChild variant="secondary"><Link href={`/entry?month=${monthParam(board.month)}`}><Keyboard />{t("Enter PF/ESIC")}</Link></Button>
          )}
          <WalkInButton />
          {board.rows.length > 0 && board.not_started > 0 && <StartMonthButton month={board.month} label={t(board.not_started > 1 ? "Add {n} new clients" : "Add {n} new client", { n: board.not_started })} variant="soft" />}
        </div>
      </div>

      <Welcome />

      {board.rows.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon={CalendarPlus}
            title={t("{month} hasn't started yet", { month: monthName })}
            body={t("This adds {month} for your {n} active clients, with each one's usual service charge. You can change anything afterwards.", { month: monthName, n: board.not_started })}
            action={board.not_started > 0 ? <StartMonthButton month={board.month} label={t("Start {month}", { month: monthName })} /> : undefined}
          />
        </Card>
      ) : (
        <>
          {s.total > 0 && s.done === s.total && <MonthClosed month={board.month} handled={s.pfPaise + s.esicPaise + s.feesPaise} clients={s.total} overdue={s.overdue} />}

          {/* ── Summary ─────────────────────────────────────── */}
          <section aria-label={t("Summary")} className="mt-6 grid gap-4 lg:grid-cols-[260px_1fr]">
            {/* Phone: one slim progress line instead of the ring */}
            <Card className="p-4 md:hidden">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">{s.done === s.total ? t("{month} is closed 🎉", { month: monthName }) : t("{n} clients still open", { n: s.total - s.done })}</span>
                <span className="tabular text-sm text-ink-muted">{t("{done} of {n}", { done: s.done, n: s.total })}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={s.done} aria-label={t("{closed} of {total} clients closed.", { closed: s.done, total: s.total })}>
                <div className="h-full rounded-full bg-primary-text transition-[width] duration-500" style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
              </div>
              {s.amountsPending > 0 && <div className="mt-1.5 text-xs text-ink-muted">{t("{n} without PF/ESIC amounts", { n: s.amountsPending })}</div>}
            </Card>
            <Card className="hidden flex-row items-center gap-5 p-4 sm:p-5 md:flex lg:flex-col lg:justify-center">
              <MonthProgressRing closed={s.done} total={s.total} today={board.today} due={due} size={150} className="shrink-0" />
              <div className="lg:text-center">
                <div className="text-sm font-semibold">{s.done === s.total ? t("{month} is closed 🎉", { month: monthName }) : t("{n} clients still open", { n: s.total - s.done })}</div>
                <div className="mt-0.5 text-xs text-ink-muted">{s.amountsPending > 0 ? t("{n} without PF/ESIC amounts", { n: s.amountsPending }) : t("All amounts entered")}</div>
              </div>
            </Card>
            {/* Phone: one swipeable row of figures, so the client list starts on the first screen */}
            <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 [&>*]:w-[42%] [&>*]:shrink-0 [&>*]:snap-start md:[&>*]:w-auto">
              <StatCard icon={ShieldAlert} tone={s.pendingPaise > 0 ? "warning" : "success"} label={t("Owes")} paise={s.pendingPaise} hint={t(s.owingClients === 1 ? "{n} client" : "{n} clients", { n: s.owingClients })} />
              <StatCard icon={Wallet} tone="success" label={t("Received")} paise={s.collectedPaise} hint={t("Against this month")} />
              <StatCard icon={Send} tone={s.notNotified ? "danger" : "default"} label={t("Not notified")} count={s.notNotified} hint={s.notNotified ? t("send reminders") : t("everyone told")} />
              <StatCard icon={FileCheck2} tone="success" label={t("Challans done")} count={s.challansDone} hint={t("of {n}", { n: s.total })} />
              <StatCard icon={Landmark} tone="primary" label="PF + ESIC" paise={s.pfPaise + s.esicPaise} hint={t("Government money")} />
              <StatCard icon={BadgeIndianRupee} label={t("Our fees")} paise={s.feesPaise} hint={t("Service charges + extras")} />
            </div>
          </section>

          {/* ── Toolbar ─────────────────────────────────────── */}
          <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div role="tablist" aria-label={t("Quick filters")} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ring-1 transition-colors ring-inset",
                    filter === f.id ? "bg-primary text-primary-ink ring-primary" : "bg-surface text-ink-muted ring-hairline hover:text-ink",
                  )}
                >
                  {t(f.label)}
                  <span className={cn("tabular rounded-full px-1.5 text-xs", filter === f.id ? "bg-white/20" : "bg-surface-2")}>{counts[f.id]}</span>
                </button>
              ))}
            </div>
            <div className="relative lg:w-80">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint" />
              <Input aria-label={t("Search clients")} placeholder={t("Search clients")} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
            </div>
          </div>

          {/* ── Clients ─────────────────────────────────────── */}
          {rows.length === 0 ? (
            <Card className="mt-4">
              <EmptyState
                icon={filter === "done" ? FileCheck2 : PartyPopper}
                title={query ? t("No client matches “{q}”", { q: query }) : filter === "done" ? t("No client is done yet") : t("Nothing here for {month} 🎉", { month: monthName })}
                body={query ? t("Try part of the name, the owner, or an old spelling.") : filter === "done" ? t("Clients appear here once paid, challan filed and receipt shared.") : t("Every client is past this step.")}
                action={query || filter !== "all" ? <Button variant="soft" onClick={() => { setQuery(""); setFilter("all"); }}>{t("Show all clients")}</Button> : undefined}
              />
            </Card>
          ) : (
            <>
              <DesktopTable rows={rows} handlers={handlers} onContact={setContactFor} />
              <PhoneList rows={rows} handlers={handlers} onPay={setPayFor} onContact={setContactFor} />
            </>
          )}
        </>
      )}

      {payFor && <RecordPaymentSheet clientId={payFor} open onOpenChange={(o) => !o && setPayFor(null)} />}
      {remindFor && <RowReminder row={remindFor} onClose={() => setRemindFor(null)} />}
      {challanFor && (
        <ChallanSheet month={challanMonth(challanFor)} partners={board.partners ?? []} open onOpenChange={(o) => !o && setChallanFor(null)}
          initialType={challanFor.pf_challan_status === "PENDING" ? "pf" : "esic"}
          notify={{ figures: { ...challanFor, firm_name_hi: null, ...challanFigures(challanFor.challans) }, phone: challanFor.whatsapp_phone ?? challanFor.phone, language: challanFor.preferred_language }} />
      )}
      {proofFor && (() => {
        const c = (proofFor.challans ?? []).find((x) => x.paid_by === "client" && !x.verified);
        return c ? <VerifyChallanSheet month={challanMonth(proofFor)} challan={c} open onOpenChange={(o) => !o && setProofFor(null)} /> : null;
      })()}
      {contactFor && <ContactSheet target={contactTarget(contactFor)} open onOpenChange={(o) => !o && setContactFor(null)} />}
    </div>
  );
}

function StartMonthButton({ month, label, variant = "primary" }: { month: string; label: string; variant?: "primary" | "soft" }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { lang, t } = useLang();
  return (
    <Button
      variant={variant}
      size={variant === "primary" ? "lg" : "md"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await startMonth(month);
          if (!r.ok) return void toast.error(t("Couldn't start the month"), { description: t(r.error) });
          toast.success(r.data ? t("{month} started", { month: formatMonth(month, lang) }) : t("Already up to date"), { description: r.data ? t("{n} clients added with their usual charge.", { n: r.data }) : undefined });
          router.refresh();
        })
      }
    >
      <Plus />
      {pending ? t("Starting…") : label}
    </Button>
  );
}

function PartnerBadge({ code }: { code: "A" | "R" | null }) {
  const { t } = useLang();
  if (!code) return null;
  return <Chip tone="primary" size="sm" className="h-5 px-1.5">{code === "A" ? t("Alok") : t("Rajeev")}</Chip>;
}

const statusOf = (r: BoardRow): RecordStatus => r.overall_status as RecordStatus;
/** We pay the challan but PF/ESIC aren't in yet: the full amount owed isn't known. */
const pendingAmounts = (r: BoardRow) => r.amount_status === "AMOUNTS_PENDING" && r.challan_payer === "us";
const dash = <span className="text-ink-faint">—</span>;

const challanMonth = (r: BoardRow): ChallanMonth => ({
  monthly_record_id: r.monthly_record_id, client_id: r.client_id, wage_month: r.wage_month, challan_payer: r.challan_payer,
  pf_paise: r.pf_paise, esic_paise: r.esic_paise, challans: r.challans,
});

/** Everything the Call / WhatsApp sheet needs about a board row. */
export function contactTarget(r: BoardRow): ContactTarget {
  return {
    clientId: r.client_id, firmName: r.firm_name, phone: r.phone, whatsapp: r.whatsapp_phone, language: r.preferred_language, ownerName: r.owner_name,
    month: !r.legacy_settled
      ? { monthlyRecordId: r.monthly_record_id, figures: { ...r, firm_name_hi: null, ...challanFigures(r.challans) }, hasChallan: !!r.challans?.length, latestReceiptId: r.latest_receipt_id }
      : undefined,
  };
}

export function RowReminder({ row, onClose, onSent }: { row: BoardRow; onClose: () => void; onSent?: () => void }) {
  return (
    <ReminderSheet
      open
      onOpenChange={(o) => !o && onClose()}
      onSent={onSent}
      clientId={row.client_id}
      monthlyRecordId={row.monthly_record_id}
      phone={row.whatsapp_phone ?? row.phone}
      language={row.preferred_language}
      figures={{ ...row, firm_name_hi: null, ...challanFigures(row.challans) }}
    />
  );
}

function DesktopTable({ rows, handlers, onContact }: { rows: BoardRow[]; handlers: (r: BoardRow) => NextStepHandlers; onContact: (r: BoardRow) => void }) {
  const reduce = useReducedMotion();
  const { t } = useLang();
  const totals = summarize(rows);
  return (
    <div className="card-highlight mt-4 hidden overflow-hidden rounded-2xl bg-surface lg:block">
      <div className="max-h-[calc(100dvh-180px)] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:h-10 [&>th]:border-b [&>th]:border-hairline [&>th]:bg-surface-2 [&>th]:px-4 [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-wide [&>th]:whitespace-nowrap [&>th]:text-ink-muted [&>th]:uppercase">
              <th className="left-0 z-20 text-left">{t("Client")}</th>
              <th className="text-right">PF</th>
              <th className="text-right">ESIC</th>
              <th className="text-right">{t("Fee")}</th>
              <th className="text-right">{t("Due to us")}</th>
              <th className="text-right">{t("Received")}</th>
              <th className="text-right">{t("Owes")}</th>
              <th className="text-left">{t("Next step")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <motion.tr
                key={r.monthly_record_id}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.015 }}
                className="group [&>td]:h-14 [&>td]:border-b [&>td]:border-hairline [&>td]:bg-surface [&>td]:px-4 hover:[&>td]:bg-surface-2/60"
              >
                <td className="sticky left-0 z-[5] max-w-[340px]">
                  <Link href={`/clients/${r.client_id}`} className="block min-w-0 rounded focus-visible:outline-2">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink group-hover:text-primary-text">{r.firm_name}</span>
                      <PartnerBadge code={r.partner_code} />
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-muted" title={r.owner_name ?? undefined}>
                      <StatusChip status={statusOf(r)} size="sm" />
                      {r.challan_payer === "client" && <ClientPaysChip />}
                    </span>
                  </Link>
                </td>
                <td className="tabular text-right">{r.pf_paise === null ? dash : <Money paise={r.pf_paise} size="sm" className="font-normal" />}</td>
                <td className="tabular text-right">{r.esic_paise === null ? dash : <Money paise={r.esic_paise} size="sm" className="font-normal" />}</td>
                <td className="tabular text-right"><Money paise={r.charge_paise + r.extras_paise} size="sm" className="font-normal" tone={r.charge_paise + r.extras_paise === 0 ? "muted" : "default"} /></td>
                <td className="tabular text-right">{r.amount_status === "AMOUNTS_PENDING" && r.challan_payer === "us" ? dash : <Money paise={r.due_to_us} size="sm" />}</td>
                <td className="tabular text-right">{r.received ? <Money paise={r.received} size="sm" tone="success" /> : dash}</td>
                <td className="tabular text-right">{pendingAmounts(r) ? dash : r.owes ? <Money paise={r.owes} size="sm" tone={r.overdue ? "danger" : "warning"} /> : dash}</td>
                <td className="whitespace-nowrap">
                  <span className="flex items-center gap-1">
                    {(() => { const step = nextStep(r); return step ? <NextStepButton step={step} month={r.wage_month} receiptId={r.latest_receipt_id} firmName={r.firm_name} handlers={handlers(r)} /> : <span className="px-2 text-xs font-medium text-success">✓ {t("All done")}</span>; })()}
                    {r.owes > 0 && nextStep(r) !== "pay" && (
                      <Button variant="ghost" size="icon" aria-label={t("Record payment for {name}", { name: r.firm_name })} title={t("Record payment")} onClick={handlers(r).onPay} className="ml-auto size-9 text-ink-muted"><Wallet /></Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label={t("Call or WhatsApp {name}", { name: r.firm_name })} title={t("Call or WhatsApp")} onClick={() => onContact(r)} className={cn("size-9 text-ink-muted", !(r.owes > 0 && nextStep(r) !== "pay") && "ml-auto")}>
                      <PhoneCall />
                    </Button>
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="[&>td]:sticky [&>td]:bottom-0 [&>td]:h-12 [&>td]:border-t [&>td]:border-hairline-strong [&>td]:bg-surface-2 [&>td]:px-4 [&>td]:font-semibold">
              <td className="left-0 z-20">{t("{n} clients", { n: rows.length })}</td>
              <td className="text-right"><Money paise={totals.pfPaise} size="sm" /></td>
              <td className="text-right"><Money paise={totals.esicPaise} size="sm" /></td>
              <td className="text-right"><Money paise={totals.feesPaise} size="sm" /></td>
              <td />
              <td className="text-right"><Money paise={totals.collectedPaise} size="sm" /></td>
              <td className="text-right"><Money paise={totals.pendingPaise} size="sm" /></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function PhoneList({ rows, handlers, onPay, onContact }: { rows: BoardRow[]; handlers: (r: BoardRow) => NextStepHandlers; onPay: (id: string) => void; onContact: (r: BoardRow) => void }) {
  const [hint, setHint] = useState(false);
  const { t, lang } = useLang();
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHint(localStorage.getItem("pfesic:swipe-hint") !== "seen");
    } catch {}
  }, []);
  const seen = () => {
    setHint(false);
    try { localStorage.setItem("pfesic:swipe-hint", "seen"); } catch {}
  };
  return (
    <div className="mt-4 lg:hidden">
      {hint && (
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-accent-soft px-3 py-2.5 text-sm text-ink ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_40%,transparent)]">
          <span className="flex-1">{lang === "hi"
            ? <>सुझाव: भुगतान दर्ज करने के लिए ग्राहक को <strong>दाएँ</strong> खिसकाएँ, कॉल या व्हाट्सऐप के लिए <strong>बाएँ</strong>।</>
            : <>Tip: swipe a client <strong>right</strong> to record a payment, <strong>left</strong> to call or WhatsApp.</>}</span>
          <button onClick={seen} aria-label={t("Got it")} className="grid size-9 place-items-center rounded-lg text-ink-muted"><X className="size-4" /></button>
        </div>
      )}
      <Card className="overflow-hidden">
        <ul className="divide-y divide-hairline">
          {rows.map((r) => <SwipeRow key={r.monthly_record_id} r={r} handlers={handlers(r)} onPay={() => { seen(); onPay(r.client_id); }} onContact={() => { seen(); onContact(r); }} />)}
        </ul>
      </Card>
    </div>
  );
}

const SWIPE = 90;

function SwipeRow({ r, handlers, onPay, onContact }: { r: BoardRow; handlers: NextStepHandlers; onPay: () => void; onContact: () => void }) {
  const reduce = useReducedMotion();
  const { t } = useLang();
  const canPay = r.owes > 0;
  const step = nextStep(r);
  // A swipe must not also count as a tap on the client's name (which would open the client page).
  const dragged = useRef(false);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    // The tap (click) can arrive before or after this; keep blocking it briefly.
    setTimeout(() => (dragged.current = false), 350);
    if (info.offset.x > SWIPE && canPay) onPay();
    else if (info.offset.x < -SWIPE) onContact();
  };
  const blockTapAfterSwipe = (e: React.MouseEvent) => {
    if (dragged.current) e.preventDefault();
  };
  return (
    <li className="relative">
      {/* What's under the row while swiping */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-between px-5 text-sm font-semibold">
        <span className={cn("flex items-center gap-2", canPay ? "text-success" : "text-ink-faint")}><Wallet className="size-5" />{t("Payment")}</span>
        <span className="flex items-center gap-2 text-success">{t("Call / WhatsApp")}<PhoneCall className="size-5" /></span>
      </div>
      <motion.div
        drag={reduce ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.6, right: canPay ? 0.6 : 0.1 }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
        className="relative touch-pan-y bg-surface px-4 py-3"
      >
       <div className="flex items-start gap-3">
        <Link href={`/clients/${r.client_id}`} className="min-w-0 flex-1" draggable={false} onClickCapture={blockTapAfterSwipe}>
          <span className="line-clamp-2 text-base leading-snug font-semibold">{r.firm_name}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusChip status={statusOf(r)} size="sm" />
            {r.challan_payer === "client" && <ClientPaysChip />}
          </span>
        </Link>
        <div className="shrink-0 text-right">
          {pendingAmounts(r) ? <span className="text-sm text-ink-faint">—</span> : r.owes ? <Money paise={r.owes} size="md" tone={r.overdue ? "danger" : "default"} /> : <Money paise={r.received} size="md" tone="success" />}
          <div className="text-xs text-ink-faint">{t(pendingAmounts(r) ? "enter PF/ESIC" : r.owes ? "owes" : r.received ? "received" : "nothing due")}</div>
        </div>
       </div>
       <div className="mt-2.5 flex items-center gap-2">
        {step
          ? <NextStepButton step={step} month={r.wage_month} receiptId={r.latest_receipt_id} firmName={r.firm_name} handlers={handlers} size="md" className="flex-1" />
          : <Link href={`/clients/${r.client_id}`} className="flex h-11 flex-1 items-center gap-1 text-sm font-medium text-success">✓ {t("All done")}<ArrowRight className="ml-auto size-4 text-ink-faint" /></Link>}
        {canPay && step !== "pay" && <Button variant="secondary" size="icon" aria-label={t("Record payment for {name}", { name: r.firm_name })} onClick={onPay}><Wallet /></Button>}
        <Button variant="secondary" size="icon" aria-label={t("Call or WhatsApp {name}", { name: r.firm_name })} onClick={onContact}><PhoneCall /></Button>
       </div>
      </motion.div>
    </li>
  );
}

/** First visits: one quiet pointer to the five-step guide. Hidden for good once closed or opened. */
function Welcome() {
  const { t } = useLang();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(localStorage.getItem("pfesic:welcome") !== "seen");
    } catch {}
  }, []);
  const seen = () => {
    setShow(false);
    try { localStorage.setItem("pfesic:welcome", "seen"); } catch {}
  };
  if (!show) return null;
  return (
    <div className="mt-5 flex items-center gap-3 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-text">
      <CircleHelp className="size-5 shrink-0" />
      <span className="flex-1">{t("New here? See how the month works in five simple steps.")}</span>
      <Button asChild size="sm" onClick={seen}><Link href="/help">{t("How it works")}</Link></Button>
      <button onClick={seen} aria-label={t("Close")} className="grid size-9 place-items-center rounded-lg"><X className="size-4" /></button>
    </div>
  );
}

/** The "month closed" moment: a calm summary with a one-time seal stamp. */
function MonthClosed({ month, handled, clients, overdue }: { month: string; handled: number; clients: number; overdue: number }) {
  const reduce = useReducedMotion();
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    try {
      const key = `pfesic:closed:${month}`;
      if (!localStorage.getItem(key)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAnimate(true);
        localStorage.setItem(key, "1");
      }
    } catch {}
  }, [month]);
  const { lang, t } = useLang();
  const name = formatMonth(month, lang).split(" ")[0];
  return (
    <Card className="mt-6 flex items-center gap-5 overflow-hidden border border-success-line bg-success-soft p-5">
      <motion.div
        initial={animate && !reduce ? { scale: 2.2, rotate: -30, opacity: 0 } : false}
        animate={{ scale: 1, rotate: -12, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="grid size-20 shrink-0 place-items-center rounded-full border-[3px] border-success text-success"
        aria-hidden
      >
        <BadgeCheck className="size-9 stroke-[1.75]" />
      </motion.div>
      <div>
        <div className="text-lg font-semibold">{t("{month} closed.", { month: name })}</div>
        <div className="mt-0.5 text-sm text-ink-muted">
          <Money paise={handled} size="sm" /> {t("handled")} · {t("{n} clients", { n: clients })} · {t("{n} overdue", { n: overdue })}. {t("Every client paid, challans filed and receipts shared.")}
        </div>
      </div>
    </Card>
  );
}
