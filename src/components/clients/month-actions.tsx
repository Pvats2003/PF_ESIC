"use client";

import { FileCheck2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { ClientDetail } from "@/app/(app)/actions";
import { ChallanSheet, VerifyChallanSheet, type ChallanInfo, type ChallanMonth } from "@/components/challan/challan-sheet";
import { challanFigures, ContactSheet } from "@/components/messages/contact-sheet";
import type { MonthFigures } from "@/lib/domain/messages";
import { PhoneCall } from "lucide-react";
import { NextStepButton } from "@/components/board/next-step-button";
import { RecordPaymentSheet } from "@/components/payment/record-payment-sheet";
import { ReminderSheet } from "@/components/messages/reminder-sheet";
import { nextStep } from "@/lib/domain/next-step";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers/lang-provider";

type Month = ClientDetail["months"][number];

/** Per-month actions on the client page: send reminder, add/correct challan, confirm a client's proof. */
export function MonthActions({ month, client, partners }: { month: Month; client: ClientDetail["client"]; partners: ClientDetail["partners"] }) {
  const { t } = useLang();
  const [sheet, setSheet] = useState<"contact" | "challan" | "pay" | "remind" | null>(null);
  const [verifying, setVerifying] = useState<ChallanInfo | null>(null);
  if (month.legacy_settled) return null;
  const cm: ChallanMonth = {
    monthly_record_id: month.monthly_record_id, client_id: client.id, wage_month: month.wage_month, challan_payer: month.challan_payer,
    pf_paise: month.pf_paise, esic_paise: month.esic_paise, challans: month.challans,
  };
  const unverified = month.challans.filter((c) => c.paid_by === "client" && !c.verified);
  const entered = month.pf_paise !== null && month.esic_paise !== null;
  const figures: MonthFigures = {
    firm_name: client.firm_name, firm_name_hi: client.firm_name_hi, owner_name: client.owner_name, wage_month: month.wage_month,
    due_date: month.due_date, challan_payer: month.challan_payer, pf_paise: month.pf_paise, esic_paise: month.esic_paise,
    charge_paise: month.charge_paise, extras_paise: month.extras_paise, owes: month.owes, overdue: month.overdue, ...challanFigures(month.challans),
  };
  const notify = { figures, phone: client.whatsapp_phone ?? client.phone, language: client.preferred_language };
  // Challans and proof have their own buttons here; the next step covers amounts, reminders and payments.
  const step = nextStep(month);
  const showStep = step === "enter_amounts" || step === "remind" || step === "pay";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {showStep && <NextStepButton step={step} month={month.wage_month} firmName={client.firm_name} handlers={{ onPay: () => setSheet("pay"), onRemind: () => setSheet("remind") }} />}
      {unverified.map((c) => (
        <Button key={c.id} variant="soft" size="sm" onClick={() => setVerifying(c)}><ShieldCheck />{t("Confirm {type}", { type: c.type.toUpperCase() })}</Button>
      ))}
      {entered && <Button variant="ghost" size="sm" aria-label={t("Add or correct challan")} onClick={() => setSheet("challan")}><FileCheck2 />{t("Challan")}</Button>}
      <Button variant="ghost" size="icon" className="size-9 text-ink-muted" aria-label={t("Call or WhatsApp {name}", { name: client.firm_name })} title={t("Call or WhatsApp")} onClick={() => setSheet("contact")}><PhoneCall /></Button>
      {sheet === "pay" && <RecordPaymentSheet clientId={client.id} open onOpenChange={(o) => !o && setSheet(null)} />}
      {sheet === "remind" && (
        <ReminderSheet open onOpenChange={(o) => !o && setSheet(null)} clientId={client.id} monthlyRecordId={month.monthly_record_id}
          phone={client.whatsapp_phone ?? client.phone} language={client.preferred_language} figures={figures} />
      )}
      {sheet === "challan" && <ChallanSheet month={cm} partners={partners} notify={notify} open onOpenChange={(o) => !o && setSheet(null)} initialType={month.pf_challan_status === "PENDING" ? "pf" : "esic"} />}
      {sheet === "contact" && (
        <ContactSheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          target={{
            clientId: client.id, firmName: client.firm_name, phone: client.phone, whatsapp: client.whatsapp_phone, language: client.preferred_language,
            month: entered ? { monthlyRecordId: month.monthly_record_id, figures, hasChallan: month.challans.length > 0, latestReceiptId: null } : undefined,
          }}
        />
      )}
      {verifying && <VerifyChallanSheet month={cm} challan={verifying} open onOpenChange={(o) => !o && setVerifying(null)} />}
    </div>
  );
}
