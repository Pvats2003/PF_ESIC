"use client";

import { ChevronLeft, FileText, MessageCircle, Phone, Receipt as ReceiptIcon, ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { ClientDetail } from "@/app/(app)/actions";
import { useLang } from "@/components/providers/lang-provider";
import { VoidPaymentButton } from "@/components/payment/corrections";
import { RecordPaymentButton } from "@/components/payment/record-payment-sheet";
import { EditClientButton } from "./client-form-sheet";
import { MonthActions } from "./month-actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, Money } from "@/components/ui/money";
import { Chip, ClientPaysChip, StatusChip, type RecordStatus } from "@/components/ui/status-chip";
import { formatDate, formatMonth } from "@/lib/format/dates";
import { formatIndianPhone, waMeNumber } from "@/lib/format/phone";
import { cn } from "@/lib/utils";

const CHALLAN: Record<string, { label: string; tone: "success" | "warning" | "neutral" | "info" }> = {
  NOT_REQUIRED: { label: "Not needed", tone: "neutral" },
  PENDING: { label: "Pending", tone: "warning" },
  PAID: { label: "Filed", tone: "success" },
  VERIFIED: { label: "Verified", tone: "success" },
};
const MODE = { cash: "Cash", upi: "UPI", bank: "Bank" } as const;
const MESSAGE: Record<string, string> = {
  dues_we_pay: "Dues reminder", challan_ready_client_pays: "Challan details", overdue: "Overdue reminder",
  payment_received: "Payment thanks", challan_filed: "Challan filed", receipt: "Receipt", other: "Message",
};
const dash = <span className="text-ink-faint">—</span>;

export function ClientView({ d }: { d: ClientDetail }) {
  const c = d.client;
  const wa = c.whatsapp_phone ?? c.phone;
  const { t, lang } = useLang();
  return (
    <div className="space-y-6">
      <Link href="/clients" className="inline-flex h-11 items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"><ChevronLeft className="size-4" />{t("Clients")}</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{c.firm_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span>{c.owner_name ?? t("Owner not added")}</span>
            {c.partner_code ? <Chip tone="primary" size="sm">{t(c.partner_name ?? "")}</Chip> : <Chip size="sm">{t("No charge (N)")}</Chip>}
            {c.challan_payer_default === "client" && <ClientPaysChip />}
            {c.kind === "occasional" && <Chip tone="info" size="sm">{t("Walk-in")}</Chip>}
            {!c.active && <Chip size="sm">{t("Archived")}</Chip>}
            {c.esic_code && !c.esic_code_verified && <Chip tone="warning" icon={ShieldAlert} size="sm">{t("Check ESIC code")}</Chip>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.phone && <Button asChild variant="secondary"><a href={`tel:${c.phone}`}><Phone />{t("Call")}</a></Button>}
          {wa && <Button asChild variant="secondary"><a href={`https://wa.me/${waMeNumber(wa)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a></Button>}
          <Button asChild variant="secondary"><Link href={`/clients/${c.id}/statement`}><FileText />{t("Statement")}</Link></Button>
          <EditClientButton client={c} />
          <RecordPaymentButton clientId={c.id} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardBody><Figure label={t("Owes")} paise={d.balance.owes} tone={d.balance.owes ? "warning" : "success"} size="xl" /></CardBody></Card>
        <Card><CardBody><Figure label={t("Advance")} paise={d.balance.advance} tone={d.balance.advance ? "primary" : "muted"} size="xl" /></CardBody></Card>
        <Card><CardBody><Figure label={t("Usual service charge")} paise={c.default_charge_paise} size="xl" sub={t("per month")} /></CardBody></Card>
        <Card>
          <CardBody>
            <div className="text-xs font-medium tracking-wide text-ink-muted uppercase">{t("Codes")}</div>
            <dl className="mt-1.5 space-y-1 text-sm">
              <div className="flex gap-2"><dt className="w-10 text-ink-muted">PF</dt><dd className="tabular truncate font-medium">{c.pf_establishment_code ?? "—"}</dd></div>
              <div className="flex gap-2"><dt className="w-10 text-ink-muted">ESIC</dt><dd className={cn("tabular truncate font-medium", c.esic_code && !c.esic_code_verified && "text-warning")}>{c.esic_code ?? "—"}</dd></div>
              {c.phone && <div className="flex gap-2"><dt className="w-10 text-ink-muted">{t("Ph.")}</dt><dd className="tabular font-medium">{formatIndianPhone(c.phone)}</dd></div>}
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>{t("Month by month")}</CardTitle></CardHeader>
        {d.months.length === 0 ? (
          <EmptyState icon={ReceiptIcon} title={t("No months yet")} body={t("Months appear here once a month is started on the This month page.")} />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="[&>th]:h-10 [&>th]:border-y [&>th]:border-hairline [&>th]:bg-surface-2 [&>th]:px-4 [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-wide [&>th]:text-ink-muted [&>th]:uppercase">
                  <th className="text-left">{t("Month")}</th><th className="text-right">PF</th><th className="text-right">ESIC</th><th className="text-right">{t("Fee")}</th>
                  <th className="text-right">{t("Due to us")}</th><th className="text-right">{t("Received")}</th><th className="text-right">{t("Owes")}</th>
                  <th className="text-left">{t("Challans")}</th><th className="text-left">{t("Status")}</th><th><span className="sr-only">{t("Actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {d.months.map((m) => (
                  <tr key={m.monthly_record_id} className="[&>td]:h-14 [&>td]:border-b [&>td]:border-hairline [&>td]:px-4">
                    <td className="font-medium whitespace-nowrap">{formatMonth(m.wage_month, lang)}{m.challan_payer === "client" && <span className="ml-2 align-middle"><ClientPaysChip /></span>}</td>
                    <td className="tabular text-right">{m.pf_paise === null ? dash : <Money paise={m.pf_paise} size="sm" className="font-normal" />}</td>
                    <td className="tabular text-right">{m.esic_paise === null ? dash : <Money paise={m.esic_paise} size="sm" className="font-normal" />}</td>
                    <td className="tabular text-right"><Money paise={m.charge_paise + m.extras_paise} size="sm" className="font-normal" /></td>
                    <td className="tabular text-right"><Money paise={m.due_to_us} size="sm" /></td>
                    <td className="tabular text-right">{m.received ? <Money paise={m.received} size="sm" tone="success" /> : dash}</td>
                    <td className="tabular text-right">{m.owes ? <Money paise={m.owes} size="sm" tone={m.overdue ? "danger" : "warning"} /> : dash}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {(["pf", "esic"] as const).map((ty) => {
                          const st = CHALLAN[ty === "pf" ? m.pf_challan_status : m.esic_challan_status];
                          const ch = m.challans.find((x) => x.type === ty);
                          return <Chip key={ty} tone={st.tone} size="sm" className="h-6">{ty.toUpperCase()} {t(st.label)}{ch?.trrn ? ` · ${ch.trrn}` : ""}</Chip>;
                        })}
                      </span>
                    </td>
                    <td><StatusChip status={m.overall_status as RecordStatus} size="sm" /></td>
                    <td><MonthActions month={m} client={c} partners={d.partners} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>{t("Payments and receipts")}</CardTitle></CardHeader>
          {d.payments.length === 0 ? (
            <EmptyState icon={ReceiptIcon} title={t("No payments yet")} body={t("Payments you record appear here with their receipts.")} />
          ) : (
            <ul className="mt-3 divide-y divide-hairline">
              {d.payments.map((p) => (
                <li key={p.id} className={cn("flex items-center gap-3 px-5 py-3", p.voided && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Money paise={p.amount} size="md" className={cn(p.voided && "line-through")} />
                      <span className="text-sm text-ink-muted">{t(MODE[p.mode])} · {t(p.received_by)}</span>
                    </div>
                    <div className="text-xs text-ink-faint">{formatDate(p.received_on)}{p.reference ? ` · ${p.reference}` : ""}{p.voided ? ` · ${t("Void")}: ${p.void_reason}` : ""}</div>
                  </div>
                  {p.receipt_id && (
                    <Button asChild variant="ghost" size="sm"><Link href={`/receipts/${p.receipt_id}`}><ReceiptIcon />{p.receipt_no}</Link></Button>
                  )}
                  {!p.voided && <VoidPaymentButton paymentId={p.id} clientId={c.id} amount={p.amount} receiptNo={p.receipt_no} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>{t("Messages")}</CardTitle></CardHeader>
          {d.messages.length === 0 ? (
            <EmptyState icon={MessageCircle} title={t("No messages yet")} body={t("Reminders and receipts shared on WhatsApp are listed here.")} />
          ) : (
            <ul className="mt-3 divide-y divide-hairline">
              {d.messages.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="font-medium">{t(MESSAGE[m.type] ?? m.type)}</span>
                  <span className="text-ink-muted">{m.status === "shared" ? t("Shared") : t("Prepared")} · {m.language === "hi" ? "हिंदी" : "English"} · {formatDate(m.sent_at.slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
