"use client";

import { ChevronLeft, Download, FileDown, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { logMessage } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { downloadBlob, nodeToPng, pngToPdf } from "@/lib/export/image-pdf";
import { formatDate, type Lang } from "@/lib/format/dates";
import { waMeNumber } from "@/lib/format/phone";
import { Statement, type StatementData } from "./statement";
import { useLang } from "@/components/providers/lang-provider";

export function StatementView({ d, years, fy }: { d: StatementData; years: string[]; fy: string }) {
  const { t } = useLang();
  const [lang, setLang] = useState<Lang>(d.client.preferred_language);
  const node = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setScale(Math.min(1, el.clientWidth / 760)); setHeight(node.current?.offsetHeight ?? 0); });
    ro.observe(el);
    if (node.current) ro.observe(node.current);
    return () => ro.disconnect();
  }, []);

  const name = `Statement-${d.client.firm_name.replace(/[^A-Za-z0-9]+/g, "-")}-${fy}-${lang}`;
  const pdf = async () => pngToPdf(await nodeToPng(node.current!, 2), "a4");

  async function share() {
    setBusy(true);
    const text = lang === "hi"
      ? `नमस्ते, ${d.client.firm_name} का ${formatDate(d.from)} से ${formatDate(d.to)} तक का खाता विवरण संलग्न है।`
      : `Namaste, the account statement for ${d.client.firm_name} from ${formatDate(d.from)} to ${formatDate(d.to)} is attached.`;
    try {
      const file = new File([await pdf()], `${name}.pdf`, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else {
        downloadBlob(file, file.name);
        const phone = d.client.whatsapp_phone ?? d.client.phone;
        window.open(`https://wa.me/${phone ? waMeNumber(phone) : ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      }
      await logMessage({ clientId: d.client.id, type: "other", language: lang, body: text, status: "shared" });
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error(t("Couldn't share"), { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link href={`/clients/${d.client.id}`} className="inline-flex h-11 items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"><ChevronLeft className="size-4" />{d.client.firm_name}</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{t("Statement")}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {years.map((y) => (
              <Link key={y} href={`/clients/${d.client.id}/statement?fy=${y}`} aria-current={y === fy ? "page" : undefined}
                className={y === fy ? "h-9 rounded-full bg-primary px-3.5 text-sm leading-9 font-medium text-primary-ink" : "h-9 rounded-full bg-surface px-3.5 text-sm leading-9 font-medium text-ink-muted ring-1 ring-hairline"}>
                FY {y}
              </Link>
            ))}
          </div>
        </div>
        <Segmented ariaLabel={t("Language")} value={lang} onChange={setLang} options={[{ value: "hi", label: <span className="font-hindi">हिंदी</span> }, { value: "en", label: t("English") }]} />
      </div>
      <div ref={box} className="w-full overflow-hidden rounded-xl" style={{ height: height ? height * scale : undefined }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 760 }}>
          <div ref={node}><Statement d={d} lang={lang} /></div>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="whatsapp" size="lg" className="flex-1" disabled={busy} onClick={share}><MessageCircle />{busy ? t("Preparing…") : t("Share on WhatsApp")}</Button>
        <Button variant="secondary" size="lg" onClick={async () => downloadBlob(await pdf(), `${name}.pdf`)}><FileDown />PDF</Button>
        <Button variant="secondary" size="lg" onClick={async () => downloadBlob(await nodeToPng(node.current!, 2), `${name}.png`)}><Download />{t("Image")}</Button>
      </div>
    </div>
  );
}
