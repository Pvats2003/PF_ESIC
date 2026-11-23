"use client";

import { Check, ChevronRight, MessageCircle, Phone, PhoneCall, Receipt, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setClientPhones } from "@/app/(app)/actions";
import { useLang } from "@/components/providers/lang-provider";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Chip } from "@/components/ui/status-chip";
import { messageOptions, type ContactMonth } from "@/lib/domain/contact";
import type { MessageKey } from "@/lib/domain/messages";
import { formatMonth, type Lang } from "@/lib/format/dates";
import { formatIndianPhone, waMeNumber } from "@/lib/format/phone";
import { cn } from "@/lib/utils";
import { ReminderSheet } from "./reminder-sheet";

export { challanFigures } from "@/lib/domain/contact";

export interface ContactTarget {
  clientId: string;
  firmName: string;
  phone: string | null;
  whatsapp: string | null;
  language: Lang;
  /** The month the messages are about (left out: only call / chat). */
  month?: ContactMonth;
}

export function ContactSheet({ target, open, onOpenChange, onSent }: { target: ContactTarget; open: boolean; onOpenChange: (o: boolean) => void; onSent?: () => void }) {
  const { t, lang } = useLang();
  const [phones, setPhones] = useState({ phone: target.phone, whatsapp: target.whatsapp });
  const [kind, setKind] = useState<MessageKey | null>(null);
  const callNo = phones.phone ?? phones.whatsapp;
  const waNo = phones.whatsapp ?? phones.phone;
  const options = target.month ? messageOptions(target.month) : [];

  if (kind && target.month) {
    return (
      <ReminderSheet
        open
        kind={kind}
        onOpenChange={(o) => { if (!o) { setKind(null); onOpenChange(false); } }}
        onSent={onSent}
        clientId={target.clientId}
        monthlyRecordId={target.month.monthlyRecordId}
        phone={waNo}
        language={target.language}
        figures={target.month.figures}
      />
    );
  }

  const row = "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-surface-2";
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={target.firmName}
      description={target.month ? formatMonth(target.month.figures.wage_month, lang) : t("Call or WhatsApp")}
    >
      <div className="space-y-5">
        {!callNo ? (
          <AddPhone clientId={target.clientId} onSaved={(p) => setPhones({ phone: p, whatsapp: null })} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="secondary" size="lg"><a href={`tel:${callNo}`}><PhoneCall />{t("Call")}</a></Button>
            <Button asChild variant="whatsapp" size="lg"><a href={`https://wa.me/${waMeNumber(waNo!)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />{t("WhatsApp chat")}</a></Button>
            <p className="tabular col-span-2 text-center text-xs text-ink-muted">
              <Phone className="mr-1 inline size-3.5" />{formatIndianPhone(callNo)}
              {phones.whatsapp && phones.phone && phones.whatsapp !== phones.phone && <> · WhatsApp {formatIndianPhone(phones.whatsapp)}</>}
            </p>
          </div>
        )}

        {options.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{t("Send a ready message")}</div>
            <ul className="-mx-3">
              {options.map((o, i) => (
                <li key={o.key}>
                  {o.key === "receipt" ? (
                    <Link href={`/receipts/${target.month!.latestReceiptId}`} className={row} onClick={() => onOpenChange(false)}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success-soft text-success"><Receipt className="size-[18px]" /></span>
                      <span className="min-w-0 flex-1"><span className="block font-medium">{t(o.label)}</span><span className="block text-xs text-ink-muted">{t(o.why)}</span></span>
                      <ChevronRight className="size-4 text-ink-faint" />
                    </Link>
                  ) : (
                    <button type="button" className={row} onClick={() => setKind(o.key as MessageKey)}>
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", i === 0 ? "bg-primary-soft text-primary-text" : "bg-surface-2 text-ink-muted")}>
                        {i === 0 ? <Sparkles className="size-[18px]" /> : <MessageCircle className="size-[18px]" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-medium">{t(o.label)}{i === 0 && <Chip tone="primary" size="sm" className="h-5 px-1.5">{t("Suggested")}</Chip>}</span>
                        <span className="block text-xs text-ink-muted">{t(o.why)}</span>
                      </span>
                      <ChevronRight className="size-4 text-ink-faint" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function AddPhone({ clientId, onSaved }: { clientId: string; onSaved: (phone: string) => void }) {
  const { t } = useLang();
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="rounded-xl bg-warning-soft p-3 ring-1 ring-warning-line ring-inset"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setClientPhones({ clientId, phone: value, whatsapp: "" });
          if (!r.ok) return void toast.error(t("Not saved"), { description: t(r.error) });
          if (r.data.phone) {
            toast.success(t("Phone saved"));
            onSaved(r.data.phone);
          }
        });
      }}
    >
      <Label htmlFor={`add-phone-${clientId}`}>{t("No phone saved yet. Add one to call and WhatsApp directly:")}</Label>
      <div className="flex gap-2">
        <Input id={`add-phone-${clientId}`} inputMode="tel" autoComplete="off" placeholder="94304 49312" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" disabled={pending || value.trim().length < 10}><Check />{pending ? t("Saving…") : t("Save")}</Button>
      </div>
    </form>
  );
}

export function ContactButton({ target, compact, className }: { target: ContactTarget; compact?: boolean; className?: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const label = t("Call or WhatsApp {name}", { name: target.firmName });
  return (
    <>
      {compact ? (
        <Button variant="ghost" size="icon" aria-label={label} title={t("Call or WhatsApp")} onClick={() => setOpen(true)} className={cn("size-9", className)}><PhoneCall /></Button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)} className={className}><PhoneCall />{t("Call / WhatsApp")}</Button>
      )}
      {open && <ContactSheet target={target} open onOpenChange={setOpen} />}
    </>
  );
}
