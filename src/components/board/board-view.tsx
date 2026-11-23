"use client";

import { ArrowRight, BadgeCheck, MessageCircle, X, BadgeIndianRupee, ChevronLeft, ChevronRight, FileCheck2, Keyboard, Landmark, PartyPopper, Plus, Search, Send, ShieldAlert, Wallet, CalendarPlus } from "lucide-react";
import { motion, useReducedMotion, type PanInfo } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { startMonth } from "@/app/(app)/actions";
import { ReminderSheet } from "@/components/messages/reminder-sheet";
import { RecordPaymentSheet } from "@/components/payment/record-payment-sheet";
import { WalkInButton } from "@/components/walkin/walk-in-sheet";
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
  const s = useMemo(() => summarize(board.rows), [board.rows]);
  const due = board.rows[0]?.due_date ?? dueDateFor(board.month, board.due_day);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, board.rows.filter((r) => matchesFilter(r, f.id)).length])), [board.rows]);
  const rows = useMemo(() => board.rows.filter((r) => matchesFilter(r, filter) && matchesSearch(r, query)), [board.rows, filter, query]);
  const monthName = formatMonth(board.month).split(" ")[0];

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium tracking-wide text-ink-muted uppercase">Wage month</div>
          <div className="mt-1 flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label="Previous month"><Link href={`/?month=${monthParam(addMonths(board.month, -1))}`}><ChevronLeft /></Link></Button>
            <h1 className="min-w-[200px] text-center text-xl font-semibold tracking-[-0.02em] sm:min-w-[230px]">{formatMonth(board.month)}</h1>
            <Button asChild variant="ghost" size="icon" aria-label="Next month"><Link href={`/?month=${monthParam(addMonths(board.month, 1))}`}><ChevronRight /></Link></Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CountdownChip today={board.today} due={due} />
          {board.rows.length > 0 && (
            <Button asChild variant="secondary"><Link href={`/entry?month=${monthParam(board.month)}`}><Keyboard />Enter PF/ESIC</Link></Button>
          )}
          <WalkInButton />
          {board.rows.length > 0 && board.not_started > 0 && <StartMonthButton month={board.month} label={`Add ${board.not_started} new client${board.not_started > 1 ? "s" : ""}`} variant="soft" />}
        </div>
      </div>

      {board.rows.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon={CalendarPlus}
            title={`${monthName} hasn't started yet`}
            body={`This adds ${monthName} for your ${board.not_started} active clients, with each one's usual service charge. You can change anything afterwards.`}
            action={board.not_started > 0 ? <StartMonthButton month={board.month} label={`Start ${monthName}`} /> : undefined}
          />
        </Card>
      ) : (
        <>
          {s.total > 0 && s.done === s.total && <MonthClosed month={board.month} handled={s.pfPaise + s.esicPaise + s.feesPaise} clients={s.total} overdue={s.overdue} />}

          {/* ── Summary ─────────────────────────────────────── */}
          <section aria-label="Summary" className="mt-6 grid gap-4 lg:grid-cols-[260px_1fr]">
            <Card className="flex flex-row items-center gap-5 p-5 lg:flex-col lg:justify-center">
              <MonthProgressRing closed={s.done} total={s.total} today={board.today} due={due} size={168} className="shrink-0" />
              <div className="lg:text-center">
                <div className="text-sm font-semibold">{s.done === s.total ? `${monthName} is closed 🎉` : `${s.total - s.done} clients still open`}</div>
                <div className="mt-0.5 text-xs text-ink-muted">{s.amountsPending > 0 ? `${s.amountsPending} without PF/ESIC amounts` : "All amounts entered"}</div>
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard icon={Landmark} tone="primary" label="PF + ESIC" paise={s.pfPaise + s.esicPaise} hint="Government money" />
              <StatCard icon={BadgeIndianRupee} label="Our fees" paise={s.feesPaise} hint="Service charges + extras" />
              <StatCard icon={Wallet} tone="success" label="Received" paise={s.collectedPaise} hint="Against this month" />
              <StatCard icon={ShieldAlert} tone={s.pendingPaise > 0 ? "warning" : "success"} label="Owes" paise={s.pendingPaise} hint={`${s.owingClients} client${s.owingClients === 1 ? "" : "s"}`} />
              <StatCard icon={FileCheck2} tone="success" label="Challans done" count={s.challansDone} hint={`of ${s.total}`} />
              <StatCard icon={Send} tone={s.notNotified ? "danger" : "default"} label="Not notified" count={s.notNotified} hint={s.notNotified ? "send reminders" : "everyone told"} />
            </div>
          </section>

          {/* ── Toolbar ─────────────────────────────────────── */}
          <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div role="tablist" aria-label="Quick filters" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
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
                  {f.label}
                  <span className={cn("tabular rounded-full px-1.5 text-xs", filter === f.id ? "bg-white/20" : "bg-surface-2")}>{counts[f.id]}</span>
                </button>
              ))}
            </div>
            <div className="relative lg:w-80">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint" />
              <Input aria-label="Search clients" placeholder="Search clients" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
            </div>
          </div>

          {/* ── Clients ─────────────────────────────────────── */}
          {rows.length === 0 ? (
            <Card className="mt-4">
              <EmptyState
                icon={filter === "done" ? FileCheck2 : PartyPopper}
                title={query ? `No client matches “${query}”` : filter === "done" ? "No client is done yet" : `Nothing here for ${monthName} 🎉`}
                body={query ? "Try part of the name, the owner, or an old spelling." : filter === "done" ? "Clients appear here once paid, challan filed and receipt shared." : "Every client is past this step."}
                action={query || filter !== "all" ? <Button variant="soft" onClick={() => { setQuery(""); setFilter("all"); }}>Show all clients</Button> : undefined}
              />
            </Card>
          ) : (
            <>
              <DesktopTable rows={rows} onPay={setPayFor} onRemind={setRemindFor} />
              <PhoneList rows={rows} onPay={setPayFor} onRemind={setRemindFor} />
            </>
          )}
        </>
      )}

      {payFor && <RecordPaymentSheet clientId={payFor} open onOpenChange={(o) => !o && setPayFor(null)} />}
      {remindFor && <RowReminder row={remindFor} onClose={() => setRemindFor(null)} />}
    </div>
  );
}

function StartMonthButton({ month, label, variant = "primary" }: { month: string; label: string; variant?: "primary" | "soft" }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size={variant === "primary" ? "lg" : "md"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await startMonth(month);
          if (!r.ok) return void toast.error("Couldn't start the month", { description: r.error });
          toast.success(r.data ? `${formatMonth(month)} started` : "Already up to date", { description: r.data ? `${r.data} clients added with their usual charge.` : undefined });
          router.refresh();
        })
      }
    >
      <Plus />
      {pending ? "Starting…" : label}
    </Button>
  );
}

function PartnerBadge({ code }: { code: "A" | "R" | null }) {
  if (!code) return <span className="text-xs text-ink-faint">N</span>;
  return <Chip tone="primary" size="sm" className="h-5 px-1.5">{code === "A" ? "Alok" : "Rajeev"}</Chip>;
}

const statusOf = (r: BoardRow): RecordStatus => r.overall_status as RecordStatus;
/** We pay the challan but PF/ESIC aren't in yet: the full amount owed isn't known. */
const pendingAmounts = (r: BoardRow) => r.amount_status === "AMOUNTS_PENDING" && r.challan_payer === "us";
const dash = <span className="text-ink-faint">—</span>;

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
      figures={{ ...row, firm_name_hi: null }}
    />
  );
}

function DesktopTable({ rows, onPay, onRemind }: { rows: BoardRow[]; onPay: (id: string) => void; onRemind: (r: BoardRow) => void }) {
  const reduce = useReducedMotion();
  const totals = summarize(rows);
  return (
    <div className="card-highlight mt-4 hidden overflow-hidden rounded-2xl bg-surface lg:block">
      <div className="max-h-[calc(100dvh-180px)] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:h-10 [&>th]:border-b [&>th]:border-hairline [&>th]:bg-surface-2 [&>th]:px-4 [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-wide [&>th]:whitespace-nowrap [&>th]:text-ink-muted [&>th]:uppercase">
              <th className="left-0 z-20 text-left">Client</th>
              <th className="text-right">PF</th>
              <th className="text-right">ESIC</th>
              <th className="text-right">Fee</th>
              <th className="text-right">Due to us</th>
              <th className="text-right">Received</th>
              <th className="text-right">Owes</th>
              <th className="text-left">Status</th>
              <th className="w-24"><span className="sr-only">Actions</span></th>
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
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                      {r.owner_name ?? "Owner not added"}
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
                <td><StatusChip status={statusOf(r)} size="sm" /></td>
                <td className="text-right whitespace-nowrap">
                  {r.amount_status === "ENTERED" && (r.owes > 0 || r.challan_payer === "client") && r.overall_status !== "DONE" && (
                    <Button variant="ghost" size="icon" aria-label={`Send reminder to ${r.firm_name}`} title="Send reminder" onClick={() => onRemind(r)} className="size-9">
                      <Send />
                    </Button>
                  )}
                  {r.owes > 0 && (
                    <Button variant="ghost" size="icon" aria-label={`Record payment for ${r.firm_name}`} onClick={() => onPay(r.client_id)} className="size-9">
                      <Wallet />
                    </Button>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="[&>td]:sticky [&>td]:bottom-0 [&>td]:h-12 [&>td]:border-t [&>td]:border-hairline-strong [&>td]:bg-surface-2 [&>td]:px-4 [&>td]:font-semibold">
              <td className="left-0 z-20">{rows.length} clients</td>
              <td className="text-right"><Money paise={totals.pfPaise} size="sm" /></td>
              <td className="text-right"><Money paise={totals.esicPaise} size="sm" /></td>
              <td className="text-right"><Money paise={totals.feesPaise} size="sm" /></td>
              <td />
              <td className="text-right"><Money paise={totals.collectedPaise} size="sm" /></td>
              <td className="text-right"><Money paise={totals.pendingPaise} size="sm" /></td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function PhoneList({ rows, onPay, onRemind }: { rows: BoardRow[]; onPay: (id: string) => void; onRemind: (r: BoardRow) => void }) {
  const [hint, setHint] = useState(false);
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
          <span className="flex-1">Tip: swipe a client <strong>right</strong> to record a payment, <strong>left</strong> to send a WhatsApp reminder.</span>
          <button onClick={seen} aria-label="Got it" className="grid size-9 place-items-center rounded-lg text-ink-muted"><X className="size-4" /></button>
        </div>
      )}
      <Card className="overflow-hidden">
        <ul className="divide-y divide-hairline">
          {rows.map((r) => <SwipeRow key={r.monthly_record_id} r={r} onPay={() => { seen(); onPay(r.client_id); }} onRemind={() => { seen(); onRemind(r); }} />)}
        </ul>
      </Card>
    </div>
  );
}

const SWIPE = 90;

function SwipeRow({ r, onPay, onRemind }: { r: BoardRow; onPay: () => void; onRemind: () => void }) {
  const reduce = useReducedMotion();
  const canPay = r.owes > 0;
  const canRemind = r.amount_status === "ENTERED" && r.overall_status !== "DONE" && (r.owes > 0 || r.challan_payer === "client");
  // A swipe must not also count as a tap on the client's name (which would open the client page).
  const dragged = useRef(false);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    // The tap (click) can arrive before or after this; keep blocking it briefly.
    setTimeout(() => (dragged.current = false), 350);
    if (info.offset.x > SWIPE && canPay) onPay();
    else if (info.offset.x < -SWIPE && canRemind) onRemind();
  };
  const blockTapAfterSwipe = (e: React.MouseEvent) => {
    if (dragged.current) e.preventDefault();
  };
  return (
    <li className="relative">
      {/* What's under the row while swiping */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-between px-5 text-sm font-semibold">
        <span className={cn("flex items-center gap-2", canPay ? "text-success" : "text-ink-faint")}><Wallet className="size-5" />Payment</span>
        <span className={cn("flex items-center gap-2", canRemind ? "text-success" : "text-ink-faint")}>WhatsApp<MessageCircle className="size-5" /></span>
      </div>
      <motion.div
        drag={reduce ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: canRemind ? 0.6 : 0.1, right: canPay ? 0.6 : 0.1 }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
        className="relative flex touch-pan-y items-center gap-3 bg-surface px-4 py-3"
      >
        <Link href={`/clients/${r.client_id}`} className="min-w-0 flex-1" draggable={false} onClickCapture={blockTapAfterSwipe}>
          <span className="line-clamp-2 text-base leading-snug font-semibold">{r.firm_name}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusChip status={statusOf(r)} size="sm" />
            {r.challan_payer === "client" && <ClientPaysChip />}
          </span>
        </Link>
        <div className="shrink-0 text-right">
          {pendingAmounts(r) ? <span className="text-sm text-ink-faint">—</span> : r.owes ? <Money paise={r.owes} size="md" tone={r.overdue ? "danger" : "default"} /> : <Money paise={r.received} size="md" tone="success" />}
          <div className="text-xs text-ink-faint">{pendingAmounts(r) ? "enter PF/ESIC" : r.owes ? "owes" : r.received ? "received" : "nothing due"}</div>
        </div>
        {canPay ? (
          <Button variant="soft" size="icon" aria-label={`Record payment for ${r.firm_name}`} onClick={onPay}><Wallet /></Button>
        ) : (
          <Link href={`/clients/${r.client_id}`} aria-label={`Open ${r.firm_name}`} className="grid size-11 place-items-center text-ink-faint"><ArrowRight className="size-4" /></Link>
        )}
      </motion.div>
    </li>
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
  const name = formatMonth(month).split(" ")[0];
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
        <div className="text-lg font-semibold">{name} closed.</div>
        <div className="mt-0.5 text-sm text-ink-muted">
          <Money paise={handled} size="sm" /> handled · {clients} clients · {overdue} overdue. Every client paid, challans filed and receipts shared.
        </div>
      </div>
    </Card>
  );
}
