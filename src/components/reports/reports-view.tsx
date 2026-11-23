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
import { useLang } from "@/components/providers/lang-provider";

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
  const [toM, setToM] = useState(to.slice(0, 7));
  const { t } = useLang();
  return (
    <form
      className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 sm:flex sm:w-auto [&_input]:min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/reports?tab=${tab}&from=${f}&to=${toM}`);
      }}
    >
      <div><Label htmlFor="r-from">{t("From")}</Label><Input id="r-from" type="month" value={f} onChange={(e) => setF(e.target.value)} className="w-full sm:w-44" /></div>
      <div><Label htmlFor="r-to">{t("To")}</Label><Input id="r-to" type="month" value={toM} onChange={(e) => setToM(e.target.value)} className="w-full sm:w-44" /></div>
      <Button type="submit" variant="secondary">{t("Show")}</Button>
    </form>
  );
}

export function ReportsHeader({ tab, from, to }: { tab: Tab; from: string; to: string }) {
  const { t, lang } = useLang();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{t("Reports")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t("{from} to {to}", { from: formatMonth(from, lang), to: formatMonth(to.slice(0, 8) + "01", lang) })}</p>
        </div>
        <PeriodPicker key={`${from}-${to}`} tab={tab} from={from} to={to} />
      </div>
      <nav aria-label={t("Reports")} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={`/reports?tab=${x.id}&from=${from.slice(0, 7)}&to=${to.slice(0, 7)}`}
            aria-current={tab === x.id ? "page" : undefined}
            className={cn("flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium ring-1 ring-inset", tab === x.id ? "bg-primary text-primary-ink ring-primary" : "bg-surface text-ink-muted ring-hairline hover:text-ink")}
          >
            {t(x.label)}
          </Link>
        ))}
      </nav>
    </div>
  );
}

// ─── Reconciliation ─────────────────────────────────────────────────────────
type ReconTab = "client" | "partner" | "month" | "pf" | "esic" | "mode";

export function ReconciliationView({ r }: { r: Recon }) {
  const { t, lang } = useLang();
  const [view, setView] = useState<ReconTab>("partner");
  const held = r.totals.gov_collected - r.totals.gov_deposited;
  return (
    <div className="space-y-6">
      {r.mismatches.length ? (
        <Card className="border border-danger-line bg-danger-soft">
          <CardBody>
            <div className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="size-5" />{t(r.mismatches.length > 1 ? "{n} things don't add up" : "{n} thing doesn't add up", { n: r.mismatches.length })}</div>
            <ul className="mt-3 space-y-1.5 text-sm text-ink">
              {r.mismatches.map((m, i) => <li key={i}>• {m.client ? <strong>{m.client}: </strong> : null}{t(m.message)}</li>)}
            </ul>
            <p className="mt-3 text-xs text-ink-muted">{t("Nothing is adjusted automatically. Fix the entry (correct the challan, reissue the receipt) and this list updates.")}</p>
          </CardBody>
        </Card>
      ) : (
        <Card className="border border-success-line bg-success-soft">
          <CardBody className="flex items-center gap-2 font-semibold text-success"><CircleCheck className="size-5" />{t("Everything reconciles for this period")}</CardBody>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Wallet} tone="success" label={t("Received")} paise={r.totals.received} hint={t("All money from clients")} />
        <StatCard icon={Landmark} tone="primary" label="PF + ESIC" paise={r.totals.gov_collected} hint={t("Government money collected")} />
        <StatCard icon={Landmark} label={t("Deposited")} paise={r.totals.gov_deposited} hint={t("Challans we paid")} />
        <StatCard icon={ShieldAlert} tone={held > 0 ? "warning" : held < 0 ? "danger" : "default"} label={t("Still to deposit")} paise={held} hint={t("Collected, not yet paid in")} />
        <StatCard icon={BadgeIndianRupee} tone="success" label={t("Earned")} paise={r.totals.fees} hint={t("Charges + extras received")} />
        <StatCard icon={PiggyBank} label={t("Owes now")} paise={r.totals.owes_now} hint={t("Advance held {amount}", { amount: formatINR(r.totals.advance_now) })} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented ariaLabel={t("View")} value={view} onChange={setView} options={[
          { value: "partner", label: t("Partner") }, { value: "client", label: t("Client") }, { value: "month", label: t("Month") },
          { value: "pf", label: "PF" }, { value: "esic", label: "ESIC" }, { value: "mode", label: t("Cash / UPI / Bank") },
        ]} />
      </div>

      <Card className="overflow-hidden">
        {view === "partner" && (
          <Table head={["Partner", "Received", "Government money", "Deposited", "Still to deposit", "Earned", "Advance"]} rows={r.partners.map((p) => [
            t(p.name), m(p.received), m(p.gov_collected), m(p.gov_deposited), m(p.gov_collected - p.gov_deposited + p.gov_handover, true), m(p.fees), m(p.advance),
          ])} />
        )}
        {view === "client" && (
          r.clients.length ? <Table head={["Client", "Due (period)", "Received (period)", "Owes now", "Advance"]} rows={r.clients.map((c) => [
            <Link key={c.id} href={`/clients/${c.id}`} className="font-medium hover:text-primary-text">{c.firm_name}</Link>, m(c.due), m(c.received), m(c.owes, true), m(c.advance),
          ])} /> : <EmptyState icon={Scale} title={t("No client activity in this period")} />
        )}
        {view === "month" && (
          r.months.length ? <Table head={["Wage month", "Clients done", "Due to us", "Received", "Owes"]} rows={r.months.map((x) => [
            formatMonth(x.wage_month, lang), t("{done} of {n}", { done: x.done, n: x.clients }), m(x.due_to_us), m(x.received), m(x.owes, true),
          ])} /> : <EmptyState icon={Scale} title={t("No months in this period")} />
        )}
        {(view === "pf" || view === "esic") && (() => {
          const rows = r.gov.filter((g) => g.typ === view);
          return rows.length ? <Table head={["Wage month", t("{x} due (we pay)", { x: view.toUpperCase() }), "Collected", "Deposited", "Difference"]} rows={rows.map((g) => [
            formatMonth(g.wage_month, lang), m(g.due), m(g.collected), m(g.deposited),
            g.collected === g.deposited ? <Chip key="ok" tone="success" icon={CircleCheck} size="sm">{t("Matches")}</Chip> : <Chip key="d" tone={g.deposited > g.collected ? "danger" : "warning"} size="sm">{formatINR(g.collected - g.deposited)} {t(g.deposited > g.collected ? "over-deposited" : "to deposit")}</Chip>,
          ])} /> : <EmptyState icon={Scale} title={t("No {x} in this period", { x: view.toUpperCase() })} />;
        })()}
        {view === "mode" && (
          r.modes.length ? <Table head={["Mode", "Payments", "Received"]} rows={r.modes.map((x) => [t(MODE[x.mode]), String(x.payments), m(x.received)])} /> : <EmptyState icon={Wallet} title={t("No payments in this period")} />
        )}
      </Card>
    </div>
  );
}

const m = (p: number, warn = false) => <Money paise={p} size="sm" tone={warn && p > 0 ? "warning" : warn && p < 0 ? "danger" : "default"} className="font-normal" />;

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  const { t } = useLang();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="[&>th]:h-10 [&>th]:border-b [&>th]:border-hairline [&>th]:bg-surface-2 [&>th]:px-4 [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-wide [&>th]:text-ink-muted [&>th]:uppercase">
            {head.map((h, i) => <th key={h} className={i === 0 ? "text-left" : "text-right"}>{t(h)}</th>)}
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
  const { t } = useLang();
  const s = computeSettlement(d);
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="text-xs font-medium tracking-wide text-ink-muted uppercase">{t("Settlement for this period")}</div>
        {s.payer && s.payee && s.amount > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-[-0.03em]">
            {t(s.payer.name)} <ArrowRight className="size-7 text-accent-text" /> {t(s.payee.name)}: <Money paise={s.amount} size="hero" tone="primary" />
          </div>
        ) : (
          <div className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{t("All square: nobody owes anything")}</div>
        )}
        <p className="mt-3 max-w-[70ch] text-sm text-ink-muted">
          {t("Fees received ({fees}) minus shared expenses = {pool} to split", { fees: formatINR(d.partners.reduce((a, p) => a + p.fees_received, 0)), pool: formatINR(s.pool) })}
          {d.split_from ? ` ${t("(split since {date})", { date: formatDate(d.split_from) })}` : ""}. {t("Each partner keeps their share; whoever holds more pays the difference. Government money is never part of this.")}
        </p>
        {!s.splitOk && <p className="mt-2 text-sm text-danger">{t("The split doesn't add up to 100%. Fix it in Settings.")}</p>}
        {d.expenses_unassigned > 0 && <p className="mt-2 text-sm text-warning">{t("{amount} of expenses have no partner marked as payer.", { amount: formatINR(d.expenses_unassigned) })}</p>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {s.rows.map((p) => (
          <Card key={p.id}>
            <CardHeader><CardTitle>{t(p.name)} <span className="font-normal text-ink-muted">· {p.share_percent}%</span></CardTitle></CardHeader>
            <CardBody>
              <dl className="space-y-2 text-sm">
                {([
                  [t("Fees received (cash with them)"), p.fees_received],
                  [t("Shared expenses they paid"), -p.expenses_paid],
                  [t("Settlements received / paid"), p.transfers_net],
                  [t("Holding"), p.holding],
                  [t("Their share ({pct}%)", { pct: p.share_percent }), p.share],
                ] as Array<[string, number]>).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-ink-muted">{k}</dt><dd><Money paise={v} size="sm" /></dd></div>
                ))}
                <div className="flex justify-between gap-3 border-t border-hairline pt-2 font-semibold">
                  <dt>{p.position > 0 ? t("Pays the other partner") : p.position < 0 ? t("Receives from the other partner") : t("Square")}</dt>
                  <dd><Money paise={Math.abs(p.position)} size="md" tone={p.position > 0 ? "warning" : p.position < 0 ? "success" : "default"} /></dd>
                </div>
                <div className="mt-3 flex justify-between gap-3 rounded-lg bg-surface-2 p-2.5"><dt className="text-ink-muted">{t("Fees from clients they handle")}</dt><dd><Money paise={p.earned_as_handler} size="sm" /></dd></div>
                <div className="flex justify-between gap-3 rounded-lg bg-primary-soft p-2.5"><dt className="text-primary-text">{t("Government money with {name}", { name: t(p.name) })}</dt><dd><Money paise={p.gov_held} size="sm" tone="primary" /></dd></div>
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
  const { t } = useLang();
  const [show, setShow] = useState<"all" | "valid" | "void">("all");
  const list = rows.filter((r) => (show === "all" ? true : show === "void" ? r.voided : !r.voided));
  const total = list.filter((r) => !r.voided).reduce((a, r) => a + r.amount, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented ariaLabel={t("Show")} value={show} onChange={setShow} options={[
          { value: "all", label: `${t("All")} (${rows.length})` }, { value: "valid", label: t("Valid") }, { value: "void", label: `${t("Cancelled")} (${rows.filter((r) => r.voided).length})` },
        ]} />
        <span className="text-sm text-ink-muted">{t("Valid receipts total")} <Money paise={total} size="sm" /></span>
      </div>
      <Card className="overflow-hidden">
        {list.length === 0 ? <EmptyState icon={Receipt} title={t("No receipts in this period")} /> : (
          <Table head={["Receipt", "Date", "Client", "Mode", "By", "Amount"]} rows={list.map((r) => [
            <span key="n" className="flex flex-col">
              <Link href={`/receipts/${r.id}`} className={cn("tabular font-semibold hover:text-primary-text", r.voided && "line-through opacity-60")}>{r.receipt_no}</Link>
              {r.voided && <span className="text-xs font-normal text-danger">{t("Cancelled")}: {r.void_reason}</span>}
              {r.replaces && <span className="text-xs font-normal text-ink-muted">{t("Replaces {no}", { no: r.replaces })}</span>}
            </span>,
            formatDate(r.issued_on), r.firm_name, t(MODE[r.mode]), t(r.received_by), <Money key="a" paise={r.amount} size="sm" className={cn(r.voided && "line-through opacity-60")} />,
          ])} />
        )}
      </Card>
    </div>
  );
}

// ─── Excel export ───────────────────────────────────────────────────────────
export function ExportView({ from, to }: { from: string; to: string }) {
  const { t, lang } = useLang();
  const href = `/reports/export?from=${from.slice(0, 7)}&to=${to.slice(0, 7)}`;
  return (
    <Card className="max-w-2xl">
      <CardBody className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success-soft text-success"><FileSpreadsheet className="size-5" /></span>
          <div>
            <div className="font-semibold">{t("Excel backup in your old sheet's layout")}</div>
            <div className="text-sm text-ink-muted">{t("One sheet per month: SL. NO. · CONTRACTOR · PF · ESIC · TOTAL · CHARGE · REMARK, with a TOTAL row and one-off work below it. Plus a Payments sheet.")}</div>
          </div>
        </div>
        <Button asChild size="lg" className="h-auto min-h-13 w-full py-3 whitespace-normal sm:w-auto"><a href={href} download><Download />{t("Download {from} to {to}", { from: formatMonth(from, lang), to: formatMonth(to.slice(0, 8) + "01", lang) })}</a></Button>
        <p className="text-xs text-ink-faint">{t("Change the period above to export other months. Keep a copy every month as your safety net.")}</p>
      </CardBody>
    </Card>
  );
}
