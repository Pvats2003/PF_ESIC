"use client";

import { Check, Wallet } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { getClientDetail, recordPayment, type ClientDetail, type PaymentResult } from "@/app/(app)/actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, MoneyInput } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMonth, todayIST } from "@/lib/format/dates";
import { formatINR, parseRupeesToPaise } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import { ReceiptShare } from "./receipt-share";
import { useLang } from "@/components/providers/lang-provider";

const rupeesText = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

export function RecordPaymentSheet({ clientId, open, onOpenChange }: { clientId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useLang();
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<PaymentResult | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    getClientDetail(clientId).then((r) => live && (r.ok ? setDetail(r.data) : setError(r.error)));
    return () => {
      live = false;
    };
  }, [clientId, open]);

  const title = done ? t("Payment recorded") : t("Record payment");
  const description = detail ? detail.client.firm_name : t("Loading…");

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {error ? (
        <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{t(error)}</p>
      ) : !detail ? (
        <div className="space-y-4" aria-hidden>
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : done ? (
        <Success result={done} />
      ) : (
        <PaymentForm detail={detail} onDone={setDone} />
      )}
    </BottomSheet>
  );
}

function PaymentForm({ detail, onDone }: { detail: ClientDetail; onDone: (r: PaymentResult) => void }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const key = useRef(crypto.randomUUID()); // one key per sheet: a double tap can't save twice
  const [pending, start] = useTransition();
  const owes = detail.balance.owes;
  const advance = detail.balance.advance;
  const defaultPartner = detail.partners.find((p) => p.code === detail.client.partner_code) ?? detail.partners[0];

  const [useAdvance, setUseAdvance] = useState(false);
  const [amount, setAmount] = useState(owes > 0 ? rupeesText(owes) : "");
  const [touched, setTouched] = useState(false);
  const [mode, setMode] = useState<"cash" | "upi" | "bank">("cash");
  const [receivedBy, setReceivedBy] = useState(defaultPartner?.id ?? "");
  const [receivedOn, setReceivedOn] = useState(todayIST());
  const [reference, setReference] = useState("");
  const [months, setMonths] = useState<string[]>(detail.open_months.map((m) => m.monthly_record_id));
  const [extraOk, setExtraOk] = useState(false); // an advance must be meant, not a typo

  const advanceUsable = Math.min(advance, owes);
  const toCollect = Math.max(owes - (useAdvance ? advanceUsable : 0), 0);
  const amountPaise = parseRupeesToPaise(amount);
  const selectedOwes = useMemo(
    () => detail.open_months.filter((m) => months.includes(m.monthly_record_id)).reduce((a, m) => a + m.owes, 0),
    [detail.open_months, months],
  );
  const coverable = Math.max(selectedOwes - (useAdvance ? advanceUsable : 0), 0);
  const extra = amountPaise !== null ? amountPaise - coverable : 0;

  function toggleAdvance(v: boolean) {
    setUseAdvance(v);
    if (!touched) setAmount(rupeesText(Math.max(owes - (v ? advanceUsable : 0), 0)) || "");
  }

  function submit() {
    if (amountPaise === null || amountPaise <= 0) return toast.error(t("Enter the amount received"));
    if (!receivedBy) return toast.error(t("Choose who received the money"));
    if (detail.open_months.length && months.length === 0) return toast.error(t("Choose at least one month, or keep it all as advance"));
    if (extra > 0 && !extraOk) return toast.error(t("Tick the box to keep the extra as advance, or correct the amount"));
    start(async () => {
      const r = await recordPayment({
        idempotencyKey: key.current, clientId: detail.client.id, amountPaise, receivedOn, mode, receivedBy,
        language: detail.client.preferred_language, reference: reference || undefined,
        months: months.length === detail.open_months.length ? null : months, useAdvance,
      });
      if (!r.ok) return void toast.error(t("Payment not saved"), { description: t(r.error) });
      if ("vibrate" in navigator) navigator.vibrate?.(15);
      onDone(r.data);
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3 text-sm">
        <div>
          <div className="text-ink-muted">{t("Owes")}</div>
          <Money paise={owes} size="lg" tone={owes ? "warning" : "success"} />
        </div>
        <div>
          <div className="text-ink-muted">{t("Advance")}</div>
          <Money paise={advance} size="lg" tone={advance ? "primary" : "muted"} />
        </div>
      </div>

      {advanceUsable > 0 && (
        <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 transition-colors ring-inset", useAdvance ? "bg-primary-soft ring-primary-text/30" : "bg-surface ring-hairline")}>
          <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={useAdvance} onChange={(e) => toggleAdvance(e.target.checked)} />
          <span>
            <span className="block font-semibold">{t("Use {amount} advance?", { amount: formatINR(advanceUsable) })}</span>
            <span className="block text-sm text-ink-muted">{t("It goes against the oldest dues first. Then {amount} is left to collect.", { amount: formatINR(toCollect) })}</span>
          </span>
        </label>
      )}

      <div>
        <Label htmlFor="pay-amount">{t("Amount received now")}</Label>
        <MoneyInput id="pay-amount" fieldSize="lg" value={amount} onChange={(e) => { setAmount(e.target.value); setTouched(true); setExtraOk(false); }} aria-invalid={amount !== "" && amountPaise === null} autoFocus />
        {amount !== "" && amountPaise === null ? (
          <FieldHint error>{t("Enter an amount like 1,500 or 1500.50")}</FieldHint>
        ) : extra > 0 ? (
          <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl bg-warning-soft p-3 text-sm ring-1 ring-warning-line ring-inset">
            <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={extraOk} onChange={(e) => setExtraOk(e.target.checked)} />
            <span>
              <span className="block font-semibold text-warning">{t("This is {amount} more than they owe", { amount: formatINR(extra) })}</span>
              <span className="block text-ink-muted">{t("Tick if they really paid extra: it is kept as advance for later months. Otherwise correct the amount.")}</span>
            </span>
          </label>
        ) : amountPaise !== null && amountPaise < coverable ? (
          <FieldHint>{t("Part payment: {amount} will still be owed.", { amount: formatINR(coverable - amountPaise) })}</FieldHint>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>{t("Mode")}</Label>
          <Segmented ariaLabel={t("Payment mode")} value={mode} onChange={setMode} options={[{ value: "cash", label: t("Cash") }, { value: "upi", label: "UPI" }, { value: "bank", label: t("Bank") }]} />
        </div>
        <div>
          <Label>{t("Received by")}</Label>
          <Segmented ariaLabel={t("Received by")} value={receivedBy} onChange={setReceivedBy} options={detail.partners.map((p) => ({ value: p.id, label: t(p.name) }))} />
        </div>
        <div>
          <Label htmlFor="pay-date">{t("Date")}</Label>
          <Input id="pay-date" type="date" value={receivedOn} max={todayIST()} onChange={(e) => setReceivedOn(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pay-ref">{mode === "cash" ? t("Note (optional)") : t("UPI / bank reference")}</Label>
          <Input id="pay-ref" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} placeholder={mode === "upi" ? "e.g. 634512987321" : ""} />
        </div>
      </div>

      {detail.open_months.length > 1 && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-muted">{t("Covers (oldest first)")}</legend>
          <div className="divide-y divide-hairline rounded-xl ring-1 ring-hairline ring-inset">
            {detail.open_months.map((m) => (
              <label key={m.monthly_record_id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--primary)]"
                  checked={months.includes(m.monthly_record_id)}
                  onChange={(e) => setMonths((xs) => (e.target.checked ? [...xs, m.monthly_record_id] : xs.filter((x) => x !== m.monthly_record_id)))}
                />
                <span className="flex-1 text-sm font-medium">{formatMonth(m.wage_month, lang)}</span>
                <Money paise={m.owes} size="sm" />
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Button type="submit" size="lg" block disabled={pending || amountPaise === null || amountPaise <= 0 || (extra > 0 && !extraOk)}>
        <Check />
        {pending ? t("Saving…") : amountPaise ? t("Save {amount} and issue receipt", { amount: formatINR(amountPaise) }) : t("Save and issue receipt")}
      </Button>
    </form>
  );
}

function Success({ result }: { result: PaymentResult }) {
  const { t } = useLang();
  const reduce = useReducedMotion();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <motion.span
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="grid size-12 place-items-center rounded-full bg-success-soft text-success"
        >
          <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.1 }} />
          </svg>
        </motion.span>
        <div>
          <div className="font-semibold">{result.duplicate ? t("Already saved") : t("Saved")} · {t("receipt")} {result.receipt_no}</div>
          <div className="text-sm text-ink-muted">
            {result.advance_used_paise > 0 && `${t("{amount} advance used.", { amount: formatINR(result.advance_used_paise) })} `}
            {result.advance_added_paise > 0 ? t("{amount} kept as advance.", { amount: formatINR(result.advance_added_paise) }) : t("Applied to the oldest dues first.")}
          </div>
        </div>
      </div>
      <motion.div initial={reduce ? false : { y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25, delay: 0.15 }}>
        <ReceiptShare receiptId={result.receipt_id} />
      </motion.div>
    </div>
  );
}

export function RecordPaymentButton({ clientId, label = "Record payment", className }: { clientId: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  return (
    <>
      <Button onClick={() => setOpen(true)} className={className}><Wallet />{t(label)}</Button>
      {open && <RecordPaymentSheet clientId={clientId} open={open} onOpenChange={setOpen} />}
    </>
  );
}
