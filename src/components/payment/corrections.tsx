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

/** Void a payment (and its receipt). The money goes back to "owes". Can't be undone. */
export function VoidPaymentButton({ paymentId, clientId, amount, receiptNo }: { paymentId: string; clientId: string; amount: number; receiptNo: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Void payment of ${formatINR(amount)}`}><Ban />Void</Button>
      {open && (
        <BottomSheet
          open
          onOpenChange={setOpen}
          title={`Void ${formatINR(amount)} payment?`}
          description={receiptNo ? `Receipt ${receiptNo} becomes void too` : undefined}
          footer={
            <Button variant="danger" size="lg" block disabled={pending || reason.trim().length < 3} onClick={() => start(async () => {
              const r = await voidPayment(paymentId, clientId, reason);
              if (!r.ok) return void toast.error("Not voided", { description: r.error });
              toast.success("Payment voided", { description: `${formatINR(amount)} is owed again. Record it again if it was entered wrongly.` });
              setOpen(false);
              router.refresh();
            })}>
              <Ban />{pending ? "Voiding…" : "Void payment"}
            </Button>
          }
        >
          <div className="space-y-4">
            <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger ring-1 ring-danger-line ring-inset">
              Use this when a payment was entered wrongly (wrong client, wrong amount). The payment and its receipt stay in history marked void; nothing is deleted. This can&apos;t be undone.
            </p>
            <div>
              <Label htmlFor="void-reason">Why?</Label>
              <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. entered for the wrong client" autoFocus />
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

/** Replace a receipt with a new number (e.g. after PF was corrected). The old one stays as void. */
export function ReissueReceiptButton({ receiptId, receiptNo, language }: { receiptId: string; receiptNo: string; language: "hi" | "en" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [lang, setLang] = useState(language);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><RotateCcw />Reissue</Button>
      {open && (
        <BottomSheet
          open
          onOpenChange={setOpen}
          title="Reissue receipt"
          description={`${receiptNo} becomes void; a new number is issued`}
          footer={
            <Button size="lg" block disabled={pending || reason.trim().length < 3} onClick={() => start(async () => {
              const r = await reissueReceipt(receiptId, reason, lang);
              if (!r.ok) return void toast.error("Not reissued", { description: r.error });
              toast.success(`New receipt ${r.data.receipt_no}`, { description: `${receiptNo} is now void.` });
              router.push(`/receipts/${r.data.receipt_id}`);
            })}>
              <RotateCcw />{pending ? "Reissuing…" : "Reissue receipt"}
            </Button>
          }
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="re-reason">Why?</Label>
              <Input id="re-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. PF amount corrected" autoFocus />
            </div>
            <div>
              <Label>Language</Label>
              <Segmented ariaLabel="Language" value={lang} onChange={setLang} options={[{ value: "hi", label: <span className="font-hindi">हिंदी</span> }, { value: "en", label: "English" }]} />
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
