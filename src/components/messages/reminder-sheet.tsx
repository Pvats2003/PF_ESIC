"use client";

import { Copy, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getMessageSetup, logMessage } from "@/app/(app)/actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { buildMessage, extraMessage, isExtraMessage, reminderKind, type AnyMessageKey, type MessageSetup, type MonthFigures } from "@/lib/domain/messages";
import { formatMonth, type Lang } from "@/lib/format/dates";
import { waMeNumber } from "@/lib/format/phone";
import { useLang } from "@/components/providers/lang-provider";

let setupCache: MessageSetup | null = null;

const TITLES: Record<AnyMessageKey, string> = {
  ask_details: "Ask for attendance and wages",
  free: "Write your own message",
  dues_we_pay: "Send dues reminder",
  challan_ready_client_pays: "Send challan details",
  overdue: "Send overdue reminder",
  payment_received: "Send payment thanks",
  challan_filed: "Send challan filed",
};

/** Builds the right WhatsApp message for a month, lets him edit it, sends it, logs it. */
export function ReminderSheet({ clientId, monthlyRecordId, figures, phone, language, kind, noMonth, open, onOpenChange, onSent }: {
  clientId: string;
  monthlyRecordId?: string;
  figures: MonthFigures;
  phone: string | null;
  language: Lang;
  kind?: AnyMessageKey;
  /** No month (e.g. a client with no months yet): the title shows only the firm. */
  noMonth?: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSent?: () => void;
}) {
  const { t } = useLang();
  const router = useRouter();
  const key = kind ?? reminderKind(figures);
  const build = useCallback((s: MessageSetup, l: Lang) => (isExtraMessage(key) ? extraMessage(key, figures, s, l) : buildMessage(key, figures, s, l)), [key, figures]);
  const [setup, setSetup] = useState<MessageSetup | null>(setupCache);
  const [lang, setLang] = useState<Lang>(language);
  const [text, setText] = useState(() => (setupCache ? build(setupCache, language) : ""));

  useEffect(() => {
    if (setup) return;
    getMessageSetup().then((r) => {
      if (!r.ok) return toast.error(t("Couldn't load message templates"), { description: t(r.error) });
      setupCache = r.data;
      setSetup(r.data);
      setText(build(r.data, lang));
    });
  }, [setup, build, lang, t]);

  function changeLang(l: Lang) {
    setLang(l);
    if (setup) setText(build(setup, l));
  }

  async function send() {
    let shared = false;
    try {
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ text });
        shared = true;
      } else {
        window.open(`https://wa.me/${phone ? waMeNumber(phone) : ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        shared = true;
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error(t("Couldn't open WhatsApp"));
    }
    if (!shared) return;
    // Logged as "shared": we handed it to WhatsApp. Delivery can't be known without the WhatsApp API.
    const r = await logMessage({ clientId, type: isExtraMessage(key) ? "other" : key, language: lang, body: text, status: "shared", monthlyRecordId: isExtraMessage(key) ? undefined : monthlyRecordId });
    if (!r.ok) toast.error(t("Sent, but not logged"), { description: t(r.error) });
    else toast.success(t("Message handed to WhatsApp"), { description: t("Marked as notified.") });
    onOpenChange(false);
    onSent?.();
    router.refresh();
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t(TITLES[key])}
      description={noMonth ? figures.firm_name : `${figures.firm_name} · ${formatMonth(figures.wage_month, lang)}`}
      footer={
        <div className="flex gap-2">
          <Button variant="whatsapp" size="lg" className="flex-1" disabled={!text} onClick={send}><MessageCircle />{t("Send on WhatsApp")}</Button>
          <Button variant="secondary" size="lg" aria-label={t("Copy message")} disabled={!text} onClick={async () => { await navigator.clipboard.writeText(text); toast(t("Copied")); }}><Copy /></Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Segmented ariaLabel={t("Language")} value={lang} onChange={changeLang} options={[{ value: "hi", label: <span className="font-hindi">हिंदी</span> }, { value: "en", label: t("English") }]} />
          {!phone && <span className="text-xs text-warning">{t("No phone saved: you'll pick the chat")}</span>}
        </div>
        {!setup ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : (
          <textarea
            aria-label={t("Message")}
            lang={lang}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={11}
            className="w-full resize-y rounded-xl border border-hairline-strong bg-surface-2 p-3.5 text-base leading-relaxed outline-none focus:border-ring"
          />
        )}
        <p className="text-xs text-ink-faint">{t("You can edit the message before sending.")}</p>
      </div>
    </BottomSheet>
  );
}
