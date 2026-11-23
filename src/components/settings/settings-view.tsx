"use client";

import { Check, Percent } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSettings, saveTemplate, setSplit } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { buildMessage, type MessageKey } from "@/lib/domain/messages";
import { formatDate, todayIST, type Lang } from "@/lib/format/dates";
import { formatIndianPhone } from "@/lib/format/phone";
import { LanguageChoice } from "@/components/app/language-toggle";
import { useLang } from "@/components/providers/lang-provider";

export interface SettingsData {
  settings: { business_name_en: string; business_name_hi: string; address_en: string; address_hi: string; phones: string[]; due_day: number; reminder_days: number[] };
  templates: Record<MessageKey, Partial<Record<Lang, string>>>;
  partners: Array<{ id: string; code: "A" | "R"; name: string; full_name: string | null }>;
  split: { effective_from: string | null; rules: Partial<Record<"A" | "R", number>> | null };
}

const TEMPLATE_INFO: Array<{ key: MessageKey; title: string; when: string }> = [
  { key: "dues_we_pay", title: "Dues reminder (we pay the challan)", when: "PF + ESIC + charge to collect" },
  { key: "challan_ready_client_pays", title: "Challan ready (client pays)", when: "Client pays the challan; we ask our charge" },
  { key: "overdue", title: "Overdue, polite", when: "Past the due date with money owed" },
  { key: "payment_received", title: "Payment received", when: "Sent with the receipt" },
  { key: "challan_filed", title: "Challan filed", when: "After we pay the challan" },
];
const PLACEHOLDERS = ["owner_name", "firm_name", "month", "pf", "esic", "charge", "total_due", "pay_by", "due_date", "balance", "months", "amount", "date", "mode", "pf_trrn", "esic_challan_no", "paid_on", "business_name"];

const SAMPLE = {
  firm_name: "UTTAM ENGINEERING", owner_name: "Ramesh", wage_month: "2026-11-01", due_date: "2026-12-15", challan_payer: "us" as const,
  pf_paise: 12_310_00, esic_paise: 1_931_00, charge_paise: 500_00, extras_paise: 0, owes: 14_741_00, overdue: false,
  pf_trrn: "3162612004578", esic_challan_no: "42-0048812", challan_paid_on: "2026-12-12",
};

export function SettingsView({ data }: { data: SettingsData }) {
  const { t } = useLang();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{t("Settings")}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t("Business details on receipts, WhatsApp messages, the partner split and due dates.")}</p>
      </div>
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{t("Screen language")}</div>
            <p className="text-sm text-ink-muted">{t("Only for this device. Receipts and messages still use each client's own language.")}</p>
          </div>
          <LanguageChoice />
        </CardBody>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Business data={data} />
        <Split data={data} />
      </div>
      <Templates data={data} />
    </div>
  );
}

function Business({ data }: { data: SettingsData }) {
  const { t } = useLang();
  const s = data.settings;
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    business_name_en: s.business_name_en, business_name_hi: s.business_name_hi, address_en: s.address_en, address_hi: s.address_hi,
    phone1: s.phones[0] ? formatIndianPhone(s.phones[0]) : "", phone2: s.phones[1] ? formatIndianPhone(s.phones[1]) : "",
    due_day: String(s.due_day), reminders: s.reminder_days.join(", "),
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  function submit() {
    start(async () => {
      const r = await saveSettings({
        business_name_en: f.business_name_en, business_name_hi: f.business_name_hi, address_en: f.address_en, address_hi: f.address_hi,
        phones: [f.phone1, f.phone2], due_day: Number(f.due_day),
        reminder_days: f.reminders.split(/[ ,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n)),
      });
      if (!r.ok) return void toast.error(t("Not saved"), { description: t(r.error) });
      toast.success(t("Business details saved"), { description: t("New receipts use them straight away.") });
    });
  }
  return (
    <Card>
      <CardHeader><CardTitle>{t("Business details")}</CardTitle></CardHeader>
      <CardBody>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="s-name">{t("Name (English)")}</Label><Input id="s-name" value={f.business_name_en} onChange={(e) => set("business_name_en", e.target.value)} /></div>
            <div><Label htmlFor="s-name-hi">{t("Name (Hindi)")}</Label><Input id="s-name-hi" lang="hi" className="font-hindi" value={f.business_name_hi} onChange={(e) => set("business_name_hi", e.target.value)} /></div>
            <div><Label htmlFor="s-addr">{t("Address (English)")}</Label><Input id="s-addr" value={f.address_en} onChange={(e) => set("address_en", e.target.value)} /></div>
            <div><Label htmlFor="s-addr-hi">{t("Address (Hindi)")}</Label><Input id="s-addr-hi" lang="hi" className="font-hindi" value={f.address_hi} onChange={(e) => set("address_hi", e.target.value)} /></div>
            <div><Label htmlFor="s-p1">{t("Phone")}</Label><Input id="s-p1" inputMode="tel" value={f.phone1} onChange={(e) => set("phone1", e.target.value)} /></div>
            <div><Label htmlFor="s-p2">{t("Second phone (optional)")}</Label><Input id="s-p2" inputMode="tel" value={f.phone2} onChange={(e) => set("phone2", e.target.value)} /></div>
            <div>
              <Label htmlFor="s-due">{t("Challans due on day")}</Label>
              <Input id="s-due" inputMode="numeric" value={f.due_day} onChange={(e) => set("due_day", e.target.value)} />
              <FieldHint>{t("Of the month after the wage month (usually 15). New months use it.")}</FieldHint>
            </div>
            <div>
              <Label htmlFor="s-rem">{t("Remind (days before due)")}</Label>
              <Input id="s-rem" value={f.reminders} onChange={(e) => set("reminders", e.target.value)} />
              <FieldHint>{t("For example 5, 2")}</FieldHint>
            </div>
          </div>
          <Button type="submit" disabled={pending}><Check />{pending ? t("Saving…") : t("Save business details")}</Button>
        </form>
      </CardBody>
    </Card>
  );
}

function Split({ data }: { data: SettingsData }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [alok, setAlok] = useState(String(data.split.rules?.A ?? 50));
  const [from, setFrom] = useState(todayIST().slice(0, 8) + "01");
  const rajeev = 100 - Number(alok || 0);
  return (
    <Card>
      <CardHeader><CardTitle>{t("Partner split")}</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-ink-muted">
          {t("Our fees, after shared expenses, are split between the partners. Now:")}{" "}
          <strong className="text-ink">{t("Alok")} {data.split.rules?.A ?? 50}% · {t("Rajeev")} {data.split.rules?.R ?? 50}%</strong>
          {data.split.effective_from && <> {t("since {date}", { date: formatDate(data.split.effective_from) })}</>}. {t("A change applies from the date you choose; earlier months keep the old split.")}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div><Label htmlFor="sp-a">{t("Alok %")}</Label><Input id="sp-a" inputMode="decimal" value={alok} onChange={(e) => setAlok(e.target.value)} /></div>
          <div><Label>{t("Rajeev %")}</Label><div className="tabular flex h-11 items-center rounded-xl bg-surface-2 px-3.5 font-semibold">{Number.isFinite(rajeev) ? rajeev : "—"}</div></div>
          <div><Label htmlFor="sp-from">{t("From")}</Label><Input id="sp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        </div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setSplit(from, Number(alok), rajeev);
              if (!r.ok) return void toast.error(t("Split not changed"), { description: t(r.error) });
              toast.success(t("Split set to {a}/{r} from {date}", { a: alok, r: rajeev, date: formatDate(from) }));
              router.refresh();
            })
          }
        >
          <Percent />{t("Change split")}
        </Button>
        <div className="rounded-xl bg-surface-2 p-3 text-sm text-ink-muted">
          {t("Partners")}: {data.partners.map((p) => `${t(p.full_name ?? p.name)} (${p.code})`).join(" · ")}
        </div>
      </CardBody>
    </Card>
  );
}

function Templates({ data }: { data: SettingsData }) {
  const { t } = useLang();
  const [lang, setLang] = useState<Lang>("hi");
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("WhatsApp messages")}</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">{t("Words in {curly brackets} are filled in automatically. The preview uses a sample client.").replace("{curly brackets}", "{…}")}</p>
        </div>
        <Segmented ariaLabel={t("Language")} value={lang} onChange={setLang} options={[{ value: "hi", label: <span className="font-hindi">हिंदी</span> }, { value: "en", label: t("English") }]} />
      </CardHeader>
      <CardBody className="space-y-6">
        {TEMPLATE_INFO.map((x) => <TemplateEditor key={`${x.key}-${lang}`} info={x} lang={lang} data={data} />)}
        <p className="text-xs text-ink-faint">{t("Available")}: {PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}</p>
      </CardBody>
    </Card>
  );
}

function TemplateEditor({ info, lang, data }: { info: (typeof TEMPLATE_INFO)[number]; lang: Lang; data: SettingsData }) {
  const { t } = useLang();
  const [body, setBody] = useState(data.templates[info.key]?.[lang] ?? "");
  const [saved, setSaved] = useState(body);
  const [pending, start] = useTransition();
  const preview = useMemo(() => {
    const setup = { templates: { [info.key]: { [lang]: body } }, business: { name_en: data.settings.business_name_en, name_hi: data.settings.business_name_hi, phones: [], due_day: data.settings.due_day } };
    return buildMessage(info.key, SAMPLE, setup, lang, { months: ["2026-10-01", "2026-11-01"] })
      .replace("{amount}", "14,741").replace("{date}", "13/12/2026").replace("{mode}", lang === "hi" ? "UPI" : "UPI");
  }, [body, info.key, lang, data.settings]);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <Label htmlFor={`t-${info.key}`}>{t(info.title)}</Label>
        <p className="-mt-1 mb-1.5 text-xs text-ink-faint">{t(info.when)}</p>
        <textarea
          id={`t-${info.key}`}
          lang={lang}
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full resize-y rounded-xl border border-hairline-strong bg-surface p-3 text-sm leading-relaxed outline-none focus:border-ring"
        />
        <Button
          size="sm"
          variant={body === saved ? "ghost" : "soft"}
          disabled={pending || body === saved}
          onClick={() =>
            start(async () => {
              const r = await saveTemplate(info.key, lang, body);
              if (!r.ok) return void toast.error(t("Not saved"), { description: t(r.error) });
              setSaved(body);
              toast.success(t("Message saved"));
            })
          }
          className="mt-2"
        >
          <Check />{body === saved ? t("Saved") : t("Save message")}
        </Button>
      </div>
      <div>
        <div className="mb-1.5 text-sm font-medium text-ink-muted">{t("Preview")}</div>
        <div lang={lang} className="rounded-xl bg-success-soft p-3 text-sm leading-relaxed whitespace-pre-line text-ink">{preview}</div>
      </div>
    </div>
  );
}
