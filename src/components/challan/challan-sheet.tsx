"use client";

import { FileCheck2, Paperclip, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveChallan, verifyChallanWithProof } from "@/app/(app)/actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, MoneyInput } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { formatMonth, todayIST } from "@/lib/format/dates";
import { formatINR, parseRupeesToPaise } from "@/lib/format/money";
import { useLang } from "@/components/providers/lang-provider";

export interface ChallanInfo { id: string; type: "pf" | "esic"; trrn: string | null; number: string | null; paid_by: "us" | "client"; verified: boolean; has_evidence: boolean }
export interface ChallanMonth {
  monthly_record_id: string;
  client_id: string;
  wage_month: string;
  challan_payer: "us" | "client";
  pf_paise: number | null;
  esic_paise: number | null;
  challans: ChallanInfo[] | null;
}
type Partner = { id: string; code: "A" | "R"; name: string };

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const rupees = (p: number | null) => (p === null ? "" : p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

export function ChallanSheet({ month, partners, initialType = "pf", open, onOpenChange }: {
  month: ChallanMonth; partners: Partner[]; initialType?: "pf" | "esic"; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState<"pf" | "esic">(initialType);
  const existing = (month.challans ?? []).find((c) => c.type === type) ?? null;
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState(rupees(type === "pf" ? month.pf_paise : month.esic_paise));
  const [paidOn, setPaidOn] = useState(todayIST());
  const [paidBy, setPaidBy] = useState<"us" | "client">(month.challan_payer);
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [verifyNow, setVerifyNow] = useState(false);
  const [reason, setReason] = useState("");

  function switchType(t: "pf" | "esic") {
    setType(t);
    setAmount(rupees(t === "pf" ? month.pf_paise : month.esic_paise));
  }

  function submit() {
    const amountPaise = parseRupeesToPaise(amount);
    if (amountPaise === null) return toast.error(t("Enter the challan amount"));
    const fd = new FormData();
    fd.set("data", JSON.stringify({
      monthlyRecordId: month.monthly_record_id, clientId: month.client_id, type, reference, amountPaise, paidOn, paidBy,
      partnerId: paidBy === "us" ? partnerId : null, replacesId: existing?.id ?? null, replaceReason: existing ? reason : undefined, verifyNow,
    }));
    if (file) fd.set("file", file);
    start(async () => {
      const r = await saveChallan(fd);
      if (!r.ok) return void toast.error(t("Challan not saved"), { description: t(r.error) });
      toast.success(t(existing ? "{type} challan corrected" : "{type} challan saved", { type: type.toUpperCase() }), {
        description: paidBy === "client" && !verifyNow ? t("Attach and confirm the client's proof to finish this month.") : undefined,
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  const expected = type === "pf" ? month.pf_paise : month.esic_paise;
  const amountPaise = parseRupeesToPaise(amount);
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? t("Correct challan") : t("Add challan")}
      description={formatMonth(month.wage_month, lang)}
      footer={<Button size="lg" block disabled={pending} onClick={submit}><FileCheck2 />{pending ? t("Saving…") : existing ? t("Save correction") : t("Save challan")}</Button>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Segmented ariaLabel={t("Challan")} value={type} onChange={switchType} options={[{ value: "pf", label: "PF" }, { value: "esic", label: "ESIC" }]} />
        {existing && (
          <div className="rounded-xl bg-warning-soft p-3 text-sm text-warning ring-1 ring-warning-line ring-inset">
            A {type.toUpperCase()} challan is already saved ({existing.trrn ?? existing.number}). Saving replaces it; the old one stays in history as void.
          </div>
        )}
        <div>
          <Label htmlFor="ch-ref">{type === "pf" ? "TRRN" : t("ESIC challan number")}</Label>
          <Input id="ch-ref" className="tabular" value={reference} onChange={(e) => setReference(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ch-amt">{t("Amount")}</Label>
            <MoneyInput id="ch-amt" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {expected !== null && amountPaise !== null && amountPaise !== expected && (
              <FieldHint error>Entered PF/ESIC for this month is {formatINR(expected)}</FieldHint>
            )}
          </div>
          <div>
            <Label htmlFor="ch-date">{t("Paid on")}</Label>
            <Input id="ch-date" type="date" value={paidOn} max={todayIST()} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("Paid by")}</Label>
            <Segmented ariaLabel={t("Paid by")} value={paidBy} onChange={setPaidBy} options={[{ value: "us", label: t("Us") }, { value: "client", label: t("Client") }]} />
          </div>
          {paidBy === "us" && (
            <div>
              <Label>{t("Which partner")}</Label>
              <Segmented ariaLabel={t("Which partner")} value={partnerId} onChange={setPartnerId} options={partners.map((p) => ({ value: p.id, label: t(p.name) }))} />
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="ch-file">Challan PDF or screenshot {paidBy === "us" ? "(optional)" : ""}</Label>
          <label htmlFor="ch-file" className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-hairline-strong px-3.5 py-2.5 text-sm text-ink-muted hover:bg-surface-2">
            <Paperclip className="size-4 shrink-0" />
            <span className="truncate">{file ? file.name : t("Choose a file (PDF or image, up to 4 MB)")}</span>
          </label>
          <input id="ch-file" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {paidBy === "client" && <FieldHint>{t("The client paid this one, so the month finishes once their proof is attached and confirmed.")}</FieldHint>}
        </div>
        {file && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={verifyNow} onChange={(e) => setVerifyNow(e.target.checked)} />
            {t("I've checked this proof matches the challan")}
          </label>
        )}
        {existing && (
          <div>
            <Label htmlFor="ch-reason">{t("Why is it being corrected?")}</Label>
            <Input id="ch-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. TRRN typed wrong")} />
          </div>
        )}
      </form>
    </BottomSheet>
  );
}

/** Attach (if needed) and confirm the client's challan proof. */
export function VerifyChallanSheet({ month, challan, open, onOpenChange }: { month: ChallanMonth; challan: ChallanInfo; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState(false);
  const needsFile = !challan.has_evidence;

  function submit() {
    if (needsFile && !file) return toast.error(t("Attach the challan proof first"));
    if (!checked) return toast.error(t("Tick the box to confirm you checked it"));
    const fd = new FormData();
    fd.set("challanId", challan.id);
    fd.set("clientId", month.client_id);
    fd.set("monthlyRecordId", month.monthly_record_id);
    if (file) fd.set("file", file);
    start(async () => {
      const r = await verifyChallanWithProof(fd);
      if (!r.ok) return void toast.error(t("Not confirmed"), { description: t(r.error) });
      toast.success(t("{type} challan confirmed", { type: challan.type.toUpperCase() }));
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("Confirm {type} challan", { type: challan.type.toUpperCase() })}
      description={`${formatMonth(month.wage_month, lang)} · ${challan.trrn ?? challan.number}`}
      footer={<Button size="lg" block disabled={pending} onClick={submit}><ShieldCheck />{pending ? t("Saving…") : t("Confirm challan")}</Button>}
    >
      <div className="space-y-4">
        {needsFile ? (
          <div>
            <Label htmlFor="v-file">{t("Client's challan proof")}</Label>
            <label htmlFor="v-file" className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-hairline-strong px-3.5 py-2.5 text-sm text-ink-muted hover:bg-surface-2">
              <Paperclip className="size-4 shrink-0" />
              <span className="truncate">{file ? file.name : t("Choose the PDF or screenshot they sent")}</span>
            </label>
            <input id="v-file" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        ) : (
          <p className="rounded-xl bg-surface-2 p-3 text-sm">{t("The proof is already attached.")}</p>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {t("I've checked the TRRN / challan number and amount match")}
        </label>
      </div>
    </BottomSheet>
  );
}
