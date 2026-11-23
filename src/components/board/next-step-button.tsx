"use client";

import { FileCheck2, Keyboard, RotateCcw, Send, Share2, ShieldCheck, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useLang } from "@/components/providers/lang-provider";
import { Button } from "@/components/ui/button";
import { NEXT_STEP_LABEL, type NextStep } from "@/lib/domain/next-step";
import { cn } from "@/lib/utils";

const ICON: Record<NextStep, LucideIcon> = {
  enter_amounts: Keyboard, remind: Send, pay: Wallet, challan: FileCheck2, proof: ShieldCheck, share_receipt: Share2, reissue: RotateCcw,
};

export interface NextStepHandlers {
  onRemind?: () => void;
  onPay?: () => void;
  onChallan?: () => void;
  onProof?: () => void;
}

/** The one labelled button for "what to do next" on a client's month. */
export function NextStepButton({ step, month, receiptId, firmName, handlers, size = "sm", className }: {
  step: NextStep; month: string; receiptId?: string | null; firmName: string; handlers: NextStepHandlers; size?: "sm" | "md"; className?: string;
}) {
  const { t } = useLang();
  const Icon = ICON[step];
  const label = t(NEXT_STEP_LABEL[step]);
  const aria = step === "remind" ? t("Send reminder to {name}", { name: firmName }) : step === "pay" ? t("Record payment for {name}", { name: firmName }) : `${label}: ${firmName}`;
  const cls = cn("whitespace-nowrap", className);
  if (step === "enter_amounts") {
    return <Button asChild variant="secondary" size={size} className={cls}><Link href={`/entry?month=${month.slice(0, 7)}`} aria-label={aria}><Icon />{label}</Link></Button>;
  }
  if ((step === "share_receipt" || step === "reissue") && receiptId) {
    return <Button asChild variant="soft" size={size} className={cls}><Link href={`/receipts/${receiptId}`} aria-label={aria}><Icon />{label}</Link></Button>;
  }
  const onClick = { remind: handlers.onRemind, pay: handlers.onPay, challan: handlers.onChallan, proof: handlers.onProof }[step as "remind" | "pay" | "challan" | "proof"];
  if (!onClick) return null;
  return <Button variant={step === "pay" ? "primary" : "soft"} size={size} className={cls} aria-label={aria} onClick={onClick}><Icon />{label}</Button>;
}
