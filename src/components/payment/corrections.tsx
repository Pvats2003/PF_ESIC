"use client";

import { Ban, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { reissueReceipt, voidPayment } from "@/app/(app)/actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { formatINR } from "@/lib/format/money";
import { useLang } from "@/components/providers/lang-provider";

/** Void a payment (and its receipt). The money goes back to "owes". Can't be undone. */
export function VoidPaymentButton({ paymentId, clientId, amount, receiptNo }: { paymentId: string; clientId: string; amount: number; receiptNo: string | null }) {
  const { t } = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={t("Void payment of {amount}", { amount: formatINR(amount) })}><Ban />{t("Void")}</Button>
      {open && (
        <BottomSheet
          open
          onOpenChange={setOpen}
          title={t("Void {amount} payment?", { amount: formatINR(amount) })}
          description={receiptNo ? t("Receipt {no} becomes void too", { no: receiptNo }) : undefined}
          footer={
            <Button variant="danger" size="lg" block disabled={pending || reason.trim().length < 3} onClick={() => start(async () => {
              const r = await voidPayment(paymentId, clientId, reason);
              if (!r.ok) return void toast.error(t("Not voided"), { description: t(r.error) });
              toast.success(t("Payment voided"), { description: t("{amount} is owed again. Record it again if it was entered wrongly.", { amount: formatINR(amount) }) });
              setOpen(false);
              router.refresh();
            })}>
              <Ban />{pending ? t("Voiding…") : t("Void payment")}
            </Button>
          }
        >
          <div className="space-y-4">
            <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger ring-1 ring-danger-line ring-inset">
              {t("Use this when a payment was entered wrongly (wrong client, wrong amount). The payment and its receipt stay in history marked void; nothing is deleted. This can't be undone.")}
            </p>
            <div>
              <Label htmlFor="void-reason">{t("Why?")}</Label>
              <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. entered for the wrong client")} autoFocus />
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

/** Replace a receipt with a new number (e.g. after PF was corrected). The old one stays as void. */
export function ReissueReceiptButton({ receiptId, receiptNo, language }: { receiptId: string; receiptNo: string; language: "hi" | "en" }) {
  const { t } = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [lang, setLang] = useState(language);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><RotateCcw />{t("Reissue")}</Button>
      {open && (
        <BottomSheet
          open
          onOpenChange={setOpen}
          title={t("Reissue receipt")}
          description={t("{no} becomes void; a new number is issued", { no: receiptNo })}
          footer={
            <Button size="lg" block disabled={pending || reason.trim().length < 3} onClick={() => start(async () => {
              const r = await reissueReceipt(receiptId, reason, lang);
              if (!r.ok) return void toast.error(t("Not reissued"), { description: t(r.error) });
              toast.success(t("New receipt {no}", { no: r.data.receipt_no }), { description: t("{no} is now void.", { no: receiptNo }) });
              router.push(`/receipts/${r.data.receipt_id}`);
            })}>
              <RotateCcw />{pending ? t("Reissuing…") : t("Reissue receipt")}
            </Button>
          }
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="re-reason">{t("Why?")}</Label>
              <Input id="re-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. PF amount corrected")} autoFocus />
            </div>
            <div>
              <Label>{t("Language")}</Label>
              <Segmented ariaLabel={t("Language")} value={lang} onChange={setLang} options={[{ value: "hi", label: <span className="font-hindi">हिंदी</span> }, { value: "en", label: t("English") }]} />
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
