"use client";

import { Ban, CircleCheck, CircleDashed, CircleDot, Clock3, FileCheck2, FileSearch, Landmark, PencilLine, RotateCcw, Send, Share2, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "neutral" | "info" | "primary";

const toneClass: Record<Tone, string> = {
  success: "bg-success-soft text-success ring-success-line",
  warning: "bg-warning-soft text-warning ring-warning-line",
  danger: "bg-danger-soft text-danger ring-danger-line",
  neutral: "bg-neutral-soft text-neutral ring-neutral-line",
  info: "bg-info-soft text-info ring-info-line",
  primary: "bg-primary-soft text-primary-text ring-transparent",
};

/** Monthly record statuses (see §6 of the brief) plus the derived "overdue". */
export type RecordStatus =
  | "AMOUNTS_PENDING" | "READY" | "NOTIFIED" | "PART_PAID" | "PAID" | "CHALLAN_PAID" | "CLOSED" | "OVERDUE" | "VOID"
  // overall statuses computed by the month_status view
  | "NOT_NOTIFIED" | "PAYMENT_PENDING" | "CHALLAN_PENDING" | "PROOF_PENDING" | "RECEIPT_TO_SHARE" | "RECEIPT_TO_REISSUE" | "DONE";

export const STATUS_META: Record<RecordStatus, { label: string; labelHi: string; tone: Tone; icon: LucideIcon }> = {
  AMOUNTS_PENDING: { label: "Amounts not entered", labelHi: "राशि बाकी", tone: "neutral", icon: CircleDashed },
  READY: { label: "Ready to notify", labelHi: "सूचना देनी है", tone: "neutral", icon: PencilLine },
  NOTIFIED: { label: "Notified", labelHi: "सूचित", tone: "warning", icon: Send },
  PART_PAID: { label: "Part paid", labelHi: "आंशिक भुगतान", tone: "warning", icon: CircleDot },
  PAID: { label: "Paid", labelHi: "भुगतान प्राप्त", tone: "success", icon: CircleCheck },
  CHALLAN_PAID: { label: "Challan paid", labelHi: "चालान जमा", tone: "success", icon: FileCheck2 },
  CLOSED: { label: "Done", labelHi: "पूर्ण", tone: "success", icon: CircleCheck },
  OVERDUE: { label: "Overdue", labelHi: "अतिदेय", tone: "danger", icon: TriangleAlert },
  VOID: { label: "Void", labelHi: "रद्द", tone: "neutral", icon: Ban },
  NOT_NOTIFIED: { label: "Not notified", labelHi: "सूचना बाकी", tone: "neutral", icon: Send },
  PAYMENT_PENDING: { label: "Payment pending", labelHi: "भुगतान बाकी", tone: "warning", icon: Clock3 },
  CHALLAN_PENDING: { label: "Challan pending", labelHi: "चालान बाकी", tone: "warning", icon: Landmark },
  PROOF_PENDING: { label: "Proof pending", labelHi: "प्रमाण बाकी", tone: "info", icon: FileSearch },
  RECEIPT_TO_SHARE: { label: "Share receipt", labelHi: "रसीद भेजनी है", tone: "primary", icon: Share2 },
  RECEIPT_TO_REISSUE: { label: "Reissue receipt", labelHi: "रसीद दोबारा", tone: "warning", icon: RotateCcw },
  DONE: { label: "Done", labelHi: "पूर्ण", tone: "success", icon: CircleCheck },
};

export function Chip({
  tone = "neutral", icon: Icon, children, className, size = "md",
}: { tone?: Tone; icon?: LucideIcon; children: React.ReactNode; className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-xs",
        toneClass[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3.5 stroke-[2]" />}
      {children}
    </span>
  );
}

/** Follows the screen language unless `lang` is given (receipts fix their own language). */
export function StatusChip({ status, lang: fixed, size }: { status: RecordStatus; lang?: "en" | "hi"; size?: "sm" | "md" }) {
  const screen = useLang().lang;
  const lang = fixed ?? screen;
  const m = STATUS_META[status];
  return (
    <Chip tone={m.tone} icon={m.icon} size={size} className={lang === "hi" ? "font-hindi" : undefined}>
      {lang === "hi" ? m.labelHi : m.label}
    </Chip>
  );
}

/** "Client pays challan" marker — sky blue, as the brief asks. */
export function ClientPaysChip() {
  const { t } = useLang();
  return (
    <Chip tone="info" icon={Landmark} size="sm">
      {t("Client pays challan")}
    </Chip>
  );
}

export function PendingChip({ children }: { children: React.ReactNode }) {
  return (
    <Chip tone="warning" icon={Clock3} size="sm">
      {children}
    </Chip>
  );
}
