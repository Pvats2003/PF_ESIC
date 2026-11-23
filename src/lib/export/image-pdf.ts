/**
 * Turns an on-screen document (receipt, statement) into a PNG and a PDF.
 * The HTML is rendered by the browser (so Hindi shapes correctly), captured as
 * an image with html-to-image, and the PDF simply holds that image: no PDF text
 * engine ever touches Devanagari.
 */
export async function nodeToPng(node: HTMLElement, pixelRatio = 2.5): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  await document.fonts.ready;
  const blob = await toBlob(node, { pixelRatio, backgroundColor: "#fffdf9", cacheBust: true });
  if (!blob) throw new Error("Couldn't draw the document");
  return blob;
}

/** One image per page, A4 or A5 portrait, centred with a small margin. */
export async function pngToPdf(png: Blob, size: "a4" | "a5" = "a5"): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(await png.arrayBuffer());
  const [w, h] = size === "a4" ? [595.28, 841.89] : [419.53, 595.28];
  const margin = 18;
  const scale = Math.min((w - margin * 2) / img.width, (h - margin * 2) / img.height);
  const page = pdf.addPage([w, h]);
  page.drawImage(img, { x: (w - img.width * scale) / 2, y: h - margin - img.height * scale, width: img.width * scale, height: img.height * scale });
  pdf.setProducer("PF ESIC Desk");
  const bytes = await pdf.save();
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
