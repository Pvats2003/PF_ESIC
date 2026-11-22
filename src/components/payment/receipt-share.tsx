"use client";

import { Download, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getReceipt, logMessage } from "@/app/(app)/actions";
import { Receipt } from "@/components/receipt/receipt";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { paymentMessage, toReceiptData, type ReceiptRow } from "@/lib/domain/receipt";
import type { Lang } from "@/lib/format/dates";
import { waMeNumber } from "@/lib/format/phone";

/** Receipt preview with language switch, WhatsApp share (image + message) and download. */
export function ReceiptShare({ receiptId }: { receiptId: string }) {
  const [data, setData] = useState<ReceiptRow | null>(null);
  const [error, setError] = useState<string>();
  const [lang, setLang] = useState<Lang>("hi");
  const [busy, setBusy] = useState(false);
  const node = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    let live = true;
    getReceipt(receiptId).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.error);
      setData(r.data);
      setLang(r.data.client.preferred_language ?? r.data.receipt.language);
    });
    return () => {
      live = false;
    };
  }, [receiptId]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setScale(Math.min(1, el.clientWidth / 560));
      setHeight(node.current?.offsetHeight ?? 0);
    });
    ro.observe(el);
    if (node.current) ro.observe(node.current);
    return () => ro.disconnect();
  }, [data]);

  if (error) return <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>;
  if (!data) return <Skeleton className="h-[480px] w-full rounded-xl" />;

  const fileName = `${data.receipt.receipt_no.replaceAll("/", "-")}-${lang}.png`;

  async function makeFile(): Promise<File> {
    const { toBlob } = await import("html-to-image");
    await document.fonts.ready;
    const blob = await toBlob(node.current!, { pixelRatio: 2.5, backgroundColor: "#fffdf9", cacheBust: true });
    if (!blob) throw new Error("Couldn't draw the receipt");
    return new File([blob], fileName, { type: "image/png" });
  }

  function download(file: File) {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function share() {
    if (!data) return;
    setBusy(true);
    const text = paymentMessage(data, lang);
    try {
      const file = await makeFile();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else {
        // Desktop or older phone: save the image, open WhatsApp with the message ready to send.
        download(file);
        const phone = data.client.whatsapp_phone ?? data.client.phone;
        window.open(`https://wa.me/${phone ? waMeNumber(phone) : ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        toast("Receipt image downloaded", { description: "Attach it in the WhatsApp chat that just opened." });
      }
      await logMessage({ clientId: data.client.id, type: "receipt", language: lang, body: text, status: "shared", paymentId: data.payment.id });
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Couldn't share the receipt", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Segmented ariaLabel="Receipt language" value={lang} onChange={setLang} options={[{ value: "hi", label: <span className="font-hindi">हिंदी</span> }, { value: "en", label: "English" }]} />
        <span className="tabular text-sm font-semibold text-primary-text">{data.receipt.receipt_no}</span>
      </div>
      <div ref={box} className="w-full overflow-hidden rounded-xl" style={{ height: height ? height * scale : undefined }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 560 }}>
          <div ref={node}>
            <Receipt data={toReceiptData(data)} lang={lang} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="whatsapp" size="lg" className="flex-1" onClick={share} disabled={busy}>
          <MessageCircle />
          {busy ? "Preparing…" : "Share on WhatsApp"}
        </Button>
        <Button variant="secondary" size="lg" onClick={async () => download(await makeFile())}>
          <Download />
          Image
        </Button>
      </div>
    </div>
  );
}
