/**
 * WhatsApp reminder texts, built from the editable templates (message_templates)
 * and a month's figures. Pure (unit-tested). Placeholders are {name}.
 */
import { addDays, formatDate, formatDayMonth, formatMonth, type ISODate, type Lang } from "@/lib/format/dates";
import { formatINR } from "@/lib/format/money";
import { fillTemplate } from "./receipt";

export type MessageKey = "dues_we_pay" | "challan_ready_client_pays" | "payment_received" | "challan_filed" | "overdue";

export interface MessageSetup {
  templates: Partial<Record<MessageKey, Partial<Record<Lang, string>>>>;
  business: { name_en: string; name_hi: string; phones: string[]; due_day: number };
}

export interface MonthFigures {
  firm_name: string;
  firm_name_hi?: string | null;
  owner_name: string | null;
  wage_month: ISODate;
  due_date: ISODate;
  challan_payer: "us" | "client";
  pf_paise: number | null;
  esic_paise: number | null;
  charge_paise: number;
  extras_paise: number;
  owes: number;
  overdue: boolean;
  pf_trrn?: string | null;
  esic_challan_no?: string | null;
  challan_paid_on?: ISODate | null;
}

/** Which reminder fits this month right now. */
export function reminderKind(m: Pick<MonthFigures, "overdue" | "owes" | "challan_payer">): MessageKey {
  if (m.overdue && m.owes > 0) return "overdue";
  return m.challan_payer === "client" ? "challan_ready_client_pays" : "dues_we_pay";
}

/** Ask for money two days before the challan due date, so there's time to file. */
export const payByDate = (due: ISODate) => addDays(due, -2);

const amt = (p: number | null) => formatINR(p ?? 0, { symbol: false });

export function buildMessage(key: MessageKey, m: MonthFigures, setup: MessageSetup, lang: Lang, extra: { balancePaise?: number; months?: ISODate[] } = {}): string {
  const template = setup.templates[key]?.[lang] ?? setup.templates[key]?.en ?? "";
  const fee = m.charge_paise + m.extras_paise;
  const totalDue = (m.challan_payer === "us" ? (m.pf_paise ?? 0) + (m.esic_paise ?? 0) : 0) + fee;
  const date = (d: ISODate) => (lang === "hi" ? formatDayMonth(d, "hi") : formatDate(d));
  return fillTemplate(template, {
    owner_name: m.owner_name ?? (lang === "hi" ? "महोदय" : "Sir/Madam"),
    firm_name: lang === "hi" && m.firm_name_hi ? m.firm_name_hi : m.firm_name,
    month: formatMonth(m.wage_month, lang),
    pf: amt(m.pf_paise),
    esic: amt(m.esic_paise),
    charge: amt(fee),
    total_due: amt(totalDue),
    pay_by: date(payByDate(m.due_date)),
    due_date: date(m.due_date),
    balance: amt(extra.balancePaise ?? m.owes),
    months: (extra.months ?? [m.wage_month]).map((x) => formatMonth(x, lang)).join(", "),
    pf_trrn: m.pf_trrn ?? "—",
    esic_challan_no: m.esic_challan_no ?? "—",
    paid_on: m.challan_paid_on ? date(m.challan_paid_on) : "—",
    business_name: lang === "hi" ? setup.business.name_hi || setup.business.name_en : setup.business.name_en,
  });
}
