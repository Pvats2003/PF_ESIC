"use client";

import { FileCheck2, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { ClientDetail } from "@/app/(app)/actions";
import { ChallanSheet, VerifyChallanSheet, type ChallanInfo, type ChallanMonth } from "@/components/challan/challan-sheet";
import { ReminderSheet } from "@/components/messages/reminder-sheet";
import { Button } from "@/components/ui/button";

type Month = ClientDetail["months"][number];

/** Per-month actions on the client page: send reminder, add/correct challan, confirm a client's proof. */
export function MonthActions({ month, client, partners }: { month: Month; client: ClientDetail["client"]; partners: ClientDetail["partners"] }) {
  const [sheet, setSheet] = useState<"remind" | "challan" | null>(null);
  const [verifying, setVerifying] = useState<ChallanInfo | null>(null);
  if (month.legacy_settled) return null;
  const cm: ChallanMonth = {
    monthly_record_id: month.monthly_record_id, client_id: client.id, wage_month: month.wage_month, challan_payer: month.challan_payer,
    pf_paise: month.pf_paise, esic_paise: month.esic_paise, challans: month.challans,
  };
  const unverified = month.challans.filter((c) => c.paid_by === "client" && !c.verified);
  const entered = month.pf_paise !== null && month.esic_paise !== null;
  return (
    <div className="flex items-center justify-end gap-1">
      {unverified.map((c) => (
        <Button key={c.id} variant="soft" size="sm" onClick={() => setVerifying(c)}><ShieldCheck />Confirm {c.type.toUpperCase()}</Button>
      ))}
      {entered && <Button variant="ghost" size="icon" className="size-9" aria-label="Add or correct challan" title="Challan" onClick={() => setSheet("challan")}><FileCheck2 /></Button>}
      {entered && (month.owes > 0 || month.challan_payer === "client") && (
        <Button variant="ghost" size="icon" className="size-9" aria-label="Send reminder" title="Send reminder" onClick={() => setSheet("remind")}><Send /></Button>
      )}
      {sheet === "challan" && <ChallanSheet month={cm} partners={partners} open onOpenChange={(o) => !o && setSheet(null)} initialType={month.pf_challan_status === "PENDING" ? "pf" : "esic"} />}
      {sheet === "remind" && (
        <ReminderSheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          clientId={client.id}
          monthlyRecordId={month.monthly_record_id}
          phone={client.whatsapp_phone ?? client.phone}
          language={client.preferred_language}
          figures={{
            firm_name: client.firm_name, firm_name_hi: client.firm_name_hi, owner_name: client.owner_name, wage_month: month.wage_month,
            due_date: month.due_date, challan_payer: month.challan_payer, pf_paise: month.pf_paise, esic_paise: month.esic_paise,
            charge_paise: month.charge_paise, extras_paise: month.extras_paise, owes: month.owes, overdue: month.overdue,
          }}
        />
      )}
      {verifying && <VerifyChallanSheet month={cm} challan={verifying} open onOpenChange={(o) => !o && setVerifying(null)} />}
    </div>
  );
}
