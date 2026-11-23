"use client";

import { Check, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { recordWalkIn, type WalkInResult } from "@/app/(app)/actions";
import { ReceiptShare } from "@/components/payment/receipt-share";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input, Label, MoneyInput } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { formatINR, parseRupeesToPaise } from "@/lib/format/money";
import { cn } from "@/lib/utils";

const SERVICES = [
  { value: "pf_claim", label: "PF claim", price: "200" },
  { value: "registration", label: "Registration", price: "50" },
  { value: "appointment_letter", label: "Appointment letter", price: "100" },
  { value: "other", label: "Other", price: "" },
] as const;
type Service = (typeof SERVICES)[number]["value"];

/** One-off work for anyone (PF claim, registration…), under 15 seconds, with a receipt if paid now. */
export function WalkInSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const [pending, start] = useTransition();
  const [done, setDone] = useState<WalkInResult | null>(null);
  const [f, setF] = useState({ name: "", phone: "", service: "pf_claim" as Service, description: "", amount: "200", partner: "A" as "A" | "R", paid: true, mode: "cash" as "cash" | "upi" | "bank" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function pickService(v: Service) {
    const s = SERVICES.find((x) => x.value === v)!;
    setF((x) => ({ ...x, service: v, amount: s.price || x.amount }));
  }

  function submit() {
    const amount = parseRupeesToPaise(f.amount);
    if (!amount) return toast.error("Enter the amount");
    start(async () => {
      const r = await recordWalkIn({
        name: f.name, phone: f.phone, service_type: f.service, description: f.description, amount_paise: amount,
        partner_code: f.partner, paid_now: f.paid, mode: f.mode, language: "hi", idempotency_key: key.current,
      });
      if (!r.ok) return void toast.error("Not saved", { description: r.error });
      if (r.data.payment) setDone(r.data);
      else {
        toast.success(`${formatINR(amount)} work recorded`, { description: `${f.name} now owes it.` });
        onOpenChange(false);
      }
      router.refresh();
    });
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={done ? "Walk-in work saved" : "Walk-in work"}
      description={done ? f.name : "PF claim, registration, letters… for anyone"}
      footer={done ? undefined : (
        <Button size="lg" block disabled={pending || !f.name.trim()} onClick={submit}>
          <Check />{pending ? "Saving…" : f.paid ? `Save and issue receipt` : "Save (not paid yet)"}
        </Button>
      )}
    >
      {done?.payment ? (
        <ReceiptShare receiptId={done.payment.receipt_id} />
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1"><Label htmlFor="w-name">Name</Label><Input id="w-name" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus placeholder="Person or firm" /></div>
            <div className="col-span-2 sm:col-span-1"><Label htmlFor="w-phone">Phone (optional)</Label><Input id="w-phone" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          </div>
          <div>
            <Label>Work</Label>
            <div className="flex flex-wrap gap-1.5">
              {SERVICES.map((s) => (
                <button key={s.value} type="button" onClick={() => pickService(s.value)} aria-pressed={f.service === s.value}
                  className={cn("h-10 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset", f.service === s.value ? "bg-primary text-primary-ink ring-primary" : "bg-surface text-ink-muted ring-hairline")}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="w-amt">Amount</Label><MoneyInput id="w-amt" value={f.amount} onChange={(e) => set("amount", e.target.value)} /></div>
            <div><Label>Done by</Label><Segmented ariaLabel="Done by" value={f.partner} onChange={(v) => set("partner", v)} options={[{ value: "A", label: "Alok" }, { value: "R", label: "Rajeev" }]} /></div>
          </div>
          <div><Label htmlFor="w-desc">Note (optional)</Label><Input id="w-desc" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Form 19, Ino Construction employee" /></div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={f.paid} onChange={(e) => set("paid", e.target.checked)} />
            Paid now
          </label>
          {f.paid && <Segmented ariaLabel="Mode" value={f.mode} onChange={(v) => set("mode", v)} options={[{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "bank", label: "Bank" }]} />}
        </form>
      )}
    </BottomSheet>
  );
}

export function WalkInButton({ variant = "secondary" }: { variant?: "secondary" | "soft" | "primary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}><UserRoundPlus />Walk-in work</Button>
      {open && <WalkInSheet open={open} onOpenChange={setOpen} />}
    </>
  );
}
