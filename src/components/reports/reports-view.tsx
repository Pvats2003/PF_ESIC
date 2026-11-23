"use client";

import { AlertTriangle, ArrowRight, BadgeIndianRupee, CircleCheck, Download, FileSpreadsheet, Landmark, PiggyBank, Receipt, Scale, ShieldAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Segmented } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { Chip } from "@/components/ui/status-chip";
import { computeSettlement, type SettlementData } from "@/lib/domain/settlement";
import { formatDate, formatMonth } from "@/lib/format/dates";
import { formatINR } from "@/lib/format/money";
import { cn } from "@/lib/utils";

export type Tab = "reconcile" | "settle" | "receipts" | "export";

export interface Recon {
  from: string; to: string;
  totals: { received: number; gov_collected: number; gov_deposited: number; fees: number; advance: number; owes_now: number; advance_now: number };
  partners: Array<{ id: string; code: "A" | "R"; name: string; received: number; gov_collected: number; gov_deposited: number; gov_handover: number; fees: number; advance: number }>;
  modes: Array<{ mode: "cash" | "upi" | "bank"; received: number; payments: number }>;
  months: Array<{ wage_month: string; due_to_us: number; received: number; owes: number; pf_due: number; esic_due: number; clients: number; done: number }>;
  gov: Array<{ wage_month: string; typ: "pf" | "esic"; due: number; collected: number; deposited: number }>;
  clients: Array<{ id: string; firm_name: string; owes: number; advance: number; received: number; due: number }>;
  mismatches: Array<{ kind: string; client: string | null; ref: string | null; wage_month: string | null; message: string }>;
}
export interface RegisterRow {
  id: string; receipt_no: string; issued_on: string; client_id: string; firm_name: string; amount: number; mode: "cash" | "upi" | "bank";
  received_by: string; language: "hi" | "en"; voided: boolean; void_reason: string | null; replaces: string | null;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "reconcile", label: "Reconciliation" },
  { id: "settle", label: "Partner settlement" },
  { id: "receipts", label: "Receipts" },
  { id: "export", label: "Excel export" },
];
const MODE = { cash: "Cash", upi: "UPI", bank: "Bank" } as const;

function PeriodPicker({ tab, from, to }: { tab: Tab; from: string; to: string }) {
  const router = useRouter();
  const [f, setF] = useState(from.slice(0, 7));
  const [t, setT] = useState(to.slice(0, 7));
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/reports?tab=${tab}&from=${f}&to=${t}`);
      }}
    >
      <div><Label htmlFor="r-from">From</Label><Input id="r-from" type="month" value={f} onChange={(e) => setF(e.target.value)} className="w-44" /></div>
      <div><Label htmlFor="r-to">To</Label><Input id="r-to" type="month" value={t} onChange={(e) => setT(e.target.value)} className="w-44" /></div>
      <Button type="submit" variant="secondary">Show</Button>
    </form>
  );
}

export function ReportsHeader({ tab, from, to }: { tab: Tab; from: string; to: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Reports</h1>
          <p className="mt-1 text-sm text-ink-muted">{formatMonth(from)} to {formatMonth(to.slice(0, 8) + "01")}</p>
        </div>
        <PeriodPicker key={`${from}-${to}`} tab={tab} from={from} to={to} />
      </div>
      <nav aria-label="Reports" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/reports?tab=${t.id}&from=${from.slice(0, 7)}&to=${to.slice(0, 7)}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium ring-1 ring-inset", tab === t.id ? "bg-primary text-primary-ink ring-primary" : "bg-surface text-ink-muted ring-hairline hover:text-ink")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

// ─── Reconciliation ─────────────────────────────────────────────────────────
type ReconTab = "client" | "partner" | "month" | "pf" | "esic" | "mode";

export function ReconciliationView({ r }: { r: Recon }) {
  const [view, setView] = useState<ReconTab>("partner");
  const held = r.totals.gov_collected - r.totals.gov_deposited;
  return (
    <div className="space-y-6">
      {r.mismatches.length ? (
        <Card className="border border-danger-line bg-danger-soft">
          <CardBody>
            <div className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="size-5" />{r.mismatches.length} thing{r.mismatches.length > 1 ? "s" : ""} don&apos;t add up</div>
            <ul className="mt-3 space-y-1.5 text-sm text-ink">
              {r.mismatches.map((m, i) => <li key={i}>• {m.client ? <strong>{m.client}: </strong> : null}{m.message}</li>)}
            </ul>
            <p className="mt-3 text-xs text-ink-muted">Nothing is adjusted automatically. Fix the entry (correct the challan, reissue the receipt) and this list updates.</p>
          </CardBody>
        </Card>
      ) : (
        <Card className="border border-success-line bg-success-soft">
          <CardBody className="flex items-center gap-2 font-semibold text-success"><CircleCheck className="size-5" />Everything reconciles for this period</CardBody>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Wallet} tone="success" label="Received" paise={r.totals.received} hint="All money from clients" />
        <StatCard icon={Landmark} tone="primary" label="PF + ESIC" paise={r.totals.gov_collected} hint="Government money collected" />
        <StatCard icon={Landmark} label="Deposited" paise={r.totals.gov_deposited} hint="Challans we paid" />
        <StatCard icon={ShieldAlert} tone={held > 0 ? "warning" : held < 0 ? "danger" : "default"} label="Still to deposit" paise={held} hint="Collected, not yet paid in" />
        <StatCard icon={BadgeIndianRupee} tone="success" label="Earned" paise={r.totals.fees} hint="Charges + extras received" />
        <StatCard icon={PiggyBank} label="Owes now" paise={r.totals.owes_now} hint={`Advance held ${formatINR(r.totals.advance_now)}`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented ariaLabel="View" value={view} onChange={setView} options={[
          { value: "partner", label: "Partner" }, { value: "client", label: "Client" }, { value: "month", label: "Month" },
          { value: "pf", label: "PF" }, { value: "esic", label: "ESIC" }, { value: "mode", label: "Cash / UPI / Bank" },
        ]} />
      </div>

      <Card className="overflow-hidden">
        {view === "partner" && (
          <Table head={["Partner", "Received", "Government money", "Deposited", "Still to deposit", "Earned", "Advance"]} rows={r.partners.map((p) => [
            p.name, m(p.received), m(p.gov_collected), m(p.gov_deposited), m(p.gov_collected - p.gov_deposited + p.gov_handover, true), m(p.fees), m(p.advance),
          ])} />
        )}
        {view === "client" && (
          r.clients.length ? <Table head={["Client", "Due (period)", "Received (period)", "Owes now", "Advance"]} rows={r.clients.map((c) => [
            <Link key={c.id} href={`/clients/${c.id}`} className="font-medium hover:text-primary-text">{c.firm_name}</Link>, m(c.due), m(c.received), m(c.owes, true), m(c.advance),
          ])} /> : <EmptyState icon={Scale} title="No client activity in this period" />
        )}
        {view === "month" && (
          r.months.length ? <Table head={["Wage month", "Clients done", "Due to us", "Received", "Owes"]} rows={r.months.map((x) => [
            formatMonth(x.wage_month), `${x.done} of ${x.clients}`, m(x.due_to_us), m(x.received), m(x.owes, true),
          ])} /> : <EmptyState icon={Scale} title="No months in this period" />
        )}
        {(view === "pf" || view === "esic") && (() => {
          const rows = r.gov.filter((g) => g.typ === view);
          return rows.length ? <Table head={["Wage month", `${view.toUpperCase()} due (we pay)`, "Collected", "Deposited", "Difference"]} rows={rows.map((g) => [
            formatMonth(g.wage_month), m(g.due), m(g.collected), m(g.deposited),
            g.collected === g.deposited ? <Chip key="ok" tone="success" icon={CircleCheck} size="sm">Matches</Chip> : <Chip key="d" tone={g.deposited > g.collected ? "danger" : "warning"} size="sm">{formatINR(g.collected - g.deposited)} {g.deposited > g.collected ? "over-deposited" : "to deposit"}</Chip>,
          ])} /> : <EmptyState icon={Scale} title={`No ${view.toUpperCase()} in this period`} />;
        })()}
        {view === "mode" && (
          r.modes.length ? <Table head={["Mode", "Payments", "Received"]} rows={r.modes.map((x) => [MODE[x.mode], String(x.payments), m(x.received)])} /> : <EmptyState icon={Wallet} title="No payments in this period" />
        )}
      </Card>
    </div>
  );
}

const m = (p: number, warn = false) => <Money paise={p} size="sm" tone={warn && p > 0 ? "warning" : warn && p < 0 ? "danger" : "default"} className="font-normal" />;

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="[&>th]:h-10 [&>th]:border-b [&>th]:border-hairline [&>th]:bg-surface-2 [&>th]:px-4 [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-wide [&>th]:text-ink-muted [&>th]:uppercase">
            {head.map((h, i) => <th key={h} className={i === 0 ? "text-left" : "text-right"}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="[&>td]:h-12 [&>td]:border-b [&>td]:border-hairline [&>td]:px-4">
              {r.map((c, j) => <td key={j} className={cn(j === 0 ? "text-left font-medium" : "tabular text-right")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Settlement ─────────────────────────────────────────────────────────────
export function SettlementView({ d }: { d: SettlementData }) {
  const s = computeSettlement(d);
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="text-xs font-medium tracking-wide text-ink-muted uppercase">Settlement for this period</div>
        {s.payer && s.payee && s.amount > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-[-0.03em]">
            {s.payer.name} <ArrowRight className="size-7 text-accent-text" /> {s.payee.name}: <Money paise={s.amount} size="hero" tone="primary" />
          </div>
        ) : (
          <div className="mt-2 text-2xl font-semibold tracking-[-0.03em]">All square: nobody owes anything</div>
        )}
        <p className="mt-3 max-w-[70ch] text-sm text-ink-muted">
          Fees received ({formatINR(d.partners.reduce((a, p) => a + p.fees_received, 0))}) minus shared expenses = {formatINR(s.pool)} to split
          {d.split_from ? ` (split since ${formatDate(d.split_from)})` : ""}. Each partner keeps their share; whoever holds more pays the difference.
          Government money is never part of this.
        </p>
        {!s.splitOk && <p className="mt-2 text-sm text-danger">The split doesn&apos;t add up to 100%. Fix it in Settings.</p>}
        {d.expenses_unassigned > 0 && <p className="mt-2 text-sm text-warning">{formatINR(d.expenses_unassigned)} of expenses have no partner marked as payer.</p>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {s.rows.map((p) => (
          <Card key={p.id}>
            <CardHeader><CardTitle>{p.name} <span className="font-normal text-ink-muted">· {p.share_percent}%</span></CardTitle></CardHeader>
            <CardBody>
              <dl className="space-y-2 text-sm">
                {([
                  ["Fees received (cash with them)", p.fees_received],
                  ["Shared expenses they paid", -p.expenses_paid],
                  ["Settlements received / paid", p.transfers_net],
                  ["Holding", p.holding],
                  [`Their share (${p.share_percent}%)`, p.share],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-ink-muted">{k}</dt><dd><Money paise={v} size="sm" /></dd></div>
                ))}
                <div className="flex justify-between gap-3 border-t border-hairline pt-2 font-semibold">
                  <dt>{p.position > 0 ? "Pays the other partner" : p.position < 0 ? "Receives from the other partner" : "Square"}</dt>
                  <dd><Money paise={Math.abs(p.position)} size="md" tone={p.position > 0 ? "warning" : p.position < 0 ? "success" : "default"} /></dd>
                </div>
                <div className="mt-3 flex justify-between gap-3 rounded-lg bg-surface-2 p-2.5"><dt className="text-ink-muted">Fees from clients they handle</dt><dd><Money paise={p.earned_as_handler} size="sm" /></dd></div>
                <div className="flex justify-between gap-3 rounded-lg bg-primary-soft p-2.5"><dt className="text-primary-text">Government money with {p.name}</dt><dd><Money paise={p.gov_held} size="sm" tone="primary" /></dd></div>
              </dl>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Receipt register ───────────────────────────────────────────────────────
export function ReceiptRegister({ rows }: { rows: RegisterRow[] }) {
  const [show, setShow] = useState<"all" | "valid" | "void">("all");
  const list = rows.filter((r) => (show === "all" ? true : show === "void" ? r.voided : !r.voided));
  const total = list.filter((r) => !r.voided).reduce((a, r) => a + r.amount, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented ariaLabel="Show" value={show} onChange={setShow} options={[
          { value: "all", label: `All (${rows.length})` }, { value: "valid", label: "Valid" }, { value: "void", label: `Void (${rows.filter((r) => r.voided).length})` },
        ]} />
        <span className="text-sm text-ink-muted">Valid receipts total <Money paise={total} size="sm" /></span>
      </div>
      <Card className="overflow-hidden">
        {list.length === 0 ? <EmptyState icon={Receipt} title="No receipts in this period" /> : (
          <Table head={["Receipt", "Date", "Client", "Mode", "By", "Amount"]} rows={list.map((r) => [
            <span key="n" className="flex flex-col">
              <Link href={`/receipts/${r.id}`} className={cn("tabular font-semibold hover:text-primary-text", r.voided && "line-through opacity-60")}>{r.receipt_no}</Link>
              {r.voided && <span className="text-xs font-normal text-danger">Void: {r.void_reason}</span>}
              {r.replaces && <span className="text-xs font-normal text-ink-muted">Replaces {r.replaces}</span>}
            </span>,
            formatDate(r.issued_on), r.firm_name, MODE[r.mode], r.received_by, <Money key="a" paise={r.amount} size="sm" className={cn(r.voided && "line-through opacity-60")} />,
          ])} />
        )}
      </Card>
    </div>
  );
}

// ─── Excel export ───────────────────────────────────────────────────────────
export function ExportView({ from, to }: { from: string; to: string }) {
  const href = `/reports/export?from=${from.slice(0, 7)}&to=${to.slice(0, 7)}`;
  return (
    <Card className="max-w-2xl">
      <CardBody className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-success-soft text-success"><FileSpreadsheet className="size-5" /></span>
          <div>
            <div className="font-semibold">Excel backup in your old sheet&apos;s layout</div>
            <div className="text-sm text-ink-muted">One sheet per month: SL. NO. · CONTRACTOR · PF · ESIC · TOTAL · CHARGE · REMARK, with a TOTAL row and one-off work below it. Plus a Payments sheet.</div>
          </div>
        </div>
        <Button asChild size="lg"><a href={href} download><Download />Download {formatMonth(from)} to {formatMonth(to.slice(0, 8) + "01")}</a></Button>
        <p className="text-xs text-ink-faint">Change the period above to export other months. Keep a copy every month as your safety net.</p>
      </CardBody>
    </Card>
  );
}
