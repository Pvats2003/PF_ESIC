/**
 * Payment receipt — rendered as HTML (not a PDF library) so Devanagari
 * conjuncts and matras shape correctly. The PNG is made from this node with
 * html-to-image and the PDF wraps that image. Fixed light colours: it's paper.
 *
 * A5 proportions (148 × 210 mm) at 560 px wide; exported at 2–3× it is crisp
 * as a WhatsApp image and prints cleanly on half an A4 sheet.
 */
import { formatDate, formatMonth, type ISODate, type Lang } from "@/lib/format/dates";
import { formatINR } from "@/lib/format/money";
import { formatIndianPhone } from "@/lib/format/phone";
import { amountInWords } from "@/lib/format/words";

export type ReceiptLine =
  | { kind: "pf" | "esic" | "charge"; month: ISODate; paise: number }
  | { kind: "extra"; month?: ISODate; label: string; paise: number };

export interface ReceiptData {
  business: { nameEn: string; nameHi: string; addressEn?: string; addressHi?: string; phones: string[] };
  receiptNo: string;
  issuedOn: ISODate;
  client: { firmName: string; firmNameHi?: string | null; ownerName?: string | null };
  lines: ReceiptLine[];
  totalDuePaise: number;
  receivedPaise: number;
  mode: "cash" | "upi" | "bank";
  reference?: string | null;
  receivedBy: { en: string; hi?: string };
  balanceAfterPaise: number;
  challans?: Array<{ month: ISODate; pfTrrn?: string | null; esicChallanNo?: string | null; paidOn?: ISODate | null }>;
  signatureUrl?: string | null;
  voided?: boolean;
}

const T = {
  en: {
    title: "Payment Receipt",
    receiptNo: "Receipt No.",
    date: "Date",
    receivedFrom: "Received from",
    owner: "Proprietor",
    months: "Wage month",
    particulars: "Particulars",
    amount: "Amount",
    pf: "Provident Fund (PF)",
    esic: "Employees' State Insurance (ESIC)",
    charge: "Service charge",
    totalDue: "Total payable",
    received: "Amount received",
    balance: "Balance remaining",
    mode: "Payment mode",
    modes: { cash: "Cash", upi: "UPI", bank: "Bank transfer" },
    reference: "Ref.",
    receivedBy: "Received by",
    inWords: "Amount received in words",
    challan: "Challan filed",
    trrn: "PF TRRN",
    esicNo: "ESIC challan",
    sign: "Authorised signatory",
    footer: "This is a payment receipt, not a tax invoice.",
    paid: "PAID",
    partPaid: "PART PAID",
    void: "VOID",
  },
  hi: {
    title: "भुगतान प्राप्ति रसीद",
    receiptNo: "रसीद संख्या",
    date: "दिनांक",
    receivedFrom: "प्राप्त किया",
    owner: "प्रोप्राइटर",
    months: "वेतन माह",
    particulars: "विवरण",
    amount: "राशि",
    pf: "भविष्य निधि (PF)",
    esic: "कर्मचारी राज्य बीमा (ESIC)",
    charge: "सेवा शुल्क",
    totalDue: "कुल देय राशि",
    received: "प्राप्त राशि",
    balance: "शेष राशि",
    mode: "भुगतान का माध्यम",
    modes: { cash: "नकद", upi: "UPI", bank: "बैंक ट्रांसफर" },
    reference: "संदर्भ",
    receivedBy: "प्राप्तकर्ता",
    inWords: "प्राप्त राशि शब्दों में",
    challan: "चालान जमा",
    trrn: "PF TRRN",
    esicNo: "ESIC चालान",
    sign: "अधिकृत हस्ताक्षर",
    footer: "यह भुगतान रसीद है, कर बीजक नहीं।",
    paid: "भुगतान प्राप्त",
    partPaid: "आंशिक भुगतान",
    void: "रद्द",
  },
} as const;

// Fixed document palette (independent of the app theme).
const C = {
  paper: "#fffdf9",
  ink: "#161a23",
  muted: "#5a6070",
  faint: "#8a8f9c",
  line: "#e6dfd3",
  indigo: "#1e2a5a",
  marigold: "#e8a33d",
  tint: "#f6f1e7",
  green: "#0b7a55",
  amber: "#9a5b00",
  rose: "#be123c",
};

function lineLabel(l: ReceiptLine, lang: Lang, multiMonth: boolean): string {
  const t = T[lang];
  const base = l.kind === "extra" ? l.label : t[l.kind];
  return multiMonth && l.month ? `${base} · ${formatMonth(l.month, lang)}` : base;
}

/** Fine guilloche band, like the security pattern on a cheque. Deterministic SVG. */
function Guilloche({ width = 560, height = 26 }: { width?: number; height?: number }) {
  const paths: string[] = [];
  for (let k = 0; k < 7; k++) {
    const amp = height * (0.22 + 0.04 * k);
    const freq = 0.045 + k * 0.0035;
    const phase = k * 0.9;
    let d = "";
    for (let x = 0; x <= width; x += 3) {
      const y = height / 2 + amp * Math.sin(x * freq + phase) * Math.cos(x * 0.011 + k);
      d += `${x === 0 ? "M" : "L"}${x},${y.toFixed(2)} `;
    }
    paths.push(d);
  }
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <rect width={width} height={height} fill={C.indigo} />
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={i % 2 ? C.marigold : "#ffffff"} strokeOpacity={i % 2 ? 0.55 : 0.28} strokeWidth={0.8} />
      ))}
    </svg>
  );
}

function Seal({ lang, partial, voided }: { lang: Lang; partial: boolean; voided?: boolean }) {
  const color = voided ? C.rose : partial ? C.amber : C.green;
  const en = voided ? T.en.void : partial ? T.en.partPaid : T.en.paid;
  const hi = voided ? T.hi.void : partial ? T.hi.partPaid : T.hi.paid;
  return (
    <div
      aria-hidden
      style={{
        width: 112, height: 112, borderRadius: "50%", border: `2.5px solid ${color}`, color,
        display: "grid", placeItems: "center", transform: "rotate(-14deg)",
        boxShadow: `inset 0 0 0 4px ${C.paper}, inset 0 0 0 5.5px ${color}`,
      }}
    >
      <div style={{ textAlign: "center", lineHeight: 1.15 }}>
        {[lang === "hi" ? hi : en, lang === "hi" ? en : hi].map((text, i) => {
          const deva = /[\u0900-\u097F]/.test(text);
          // Size to fit inside the 112 px ring whatever the wording
          const size = i === 0 ? (text.length > 8 ? (deva ? 13 : 12) : deva ? 16 : 18) : text.length > 8 ? 9.5 : 11;
          return (
            <div key={i}>
              {i === 1 && <div style={{ width: 54, height: 1, background: color, margin: "5px auto", opacity: 0.6 }} />}
              <div style={{ fontSize: size, fontWeight: i === 0 ? 800 : 600, letterSpacing: deva ? 0 : i === 0 ? "0.08em" : "0.04em", whiteSpace: "nowrap", fontFamily: deva ? "var(--font-devanagari), sans-serif" : "var(--font-jakarta), sans-serif" }}>
                {text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Receipt({ data, lang }: { data: ReceiptData; lang: Lang }) {
  const t = T[lang];
  const months = [...new Set(data.lines.map((l) => l.month).filter(Boolean) as ISODate[])].sort();
  const multiMonth = months.length > 1;
  const firm = lang === "hi" && data.client.firmNameHi ? data.client.firmNameHi : data.client.firmName;
  const address = lang === "hi" ? data.business.addressHi || data.business.addressEn : data.business.addressEn;
  const partial = data.balanceAfterPaise > 0;
  const challans = (data.challans ?? []).filter((c) => c.pfTrrn || c.esicChallanNo);
  const isHi = lang === "hi";

  const label: React.CSSProperties = { fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: isHi ? 0 : "0.06em", textTransform: isHi ? "none" : "uppercase" };
  const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums", fontFeatureSettings: '"tnum","lnum"', textAlign: "right", whiteSpace: "nowrap" };

  return (
    <article
      lang={lang}
      data-receipt
      style={{
        width: 560, background: C.paper, color: C.ink, position: "relative", overflow: "hidden",
        fontFamily: isHi ? "var(--font-devanagari), var(--font-jakarta), sans-serif" : "var(--font-jakarta), var(--font-devanagari), sans-serif",
        fontSize: 13, lineHeight: isHi ? 1.6 : 1.45, borderRadius: 6,
        boxShadow: "0 1px 2px rgb(0 0 0 / 0.05), 0 16px 40px -12px rgb(0 0 0 / 0.18)",
      }}
    >
      <Guilloche />

      {/* Letterhead: always both scripts */}
      <header style={{ padding: "22px 32px 16px", textAlign: "center", borderBottom: `1px solid ${C.line}` }}>
        <div lang="hi" style={{ fontFamily: "var(--font-devanagari), sans-serif", fontSize: 24, fontWeight: 700, color: C.indigo, lineHeight: 1.35 }}>
          {data.business.nameHi}
        </div>
        <div style={{ fontFamily: "var(--font-jakarta), sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.22em", color: C.indigo, textTransform: "uppercase", marginTop: 2 }}>
          {data.business.nameEn}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
          {[address, data.business.phones.map(formatIndianPhone).join(" · ")].filter(Boolean).join("  ·  ")}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14 }}>
          <span style={{ height: 1, width: 48, background: C.marigold }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: isHi ? 0 : "0.04em" }}>{t.title}</span>
          <span style={{ height: 1, width: 48, background: C.marigold }} />
        </div>
      </header>

      {/* Meta */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: "16px 32px 4px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={label}>{t.receivedFrom}</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{firm}</div>
          {data.client.ownerName && (
            <div style={{ fontSize: 12, color: C.muted }}>
              {t.owner}: {data.client.ownerName}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {t.months}: <span style={{ color: C.ink, fontWeight: 600 }}>{months.map((m) => formatMonth(m, lang)).join(", ")}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={label}>{t.receiptNo}</div>
          <div style={{ ...num, fontSize: 14, fontWeight: 700, color: C.indigo, marginTop: 2 }}>{data.receiptNo}</div>
          <div style={{ ...label, marginTop: 8 }}>{t.date}</div>
          <div style={{ ...num, fontSize: 13, fontWeight: 600 }}>{formatDate(data.issuedOn)}</div>
        </div>
      </section>

      {/* Breakdown */}
      <section style={{ padding: "12px 32px 0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...label, textAlign: "left", padding: "8px 0", borderBottom: `1.5px solid ${C.ink}` }}>{t.particulars}</th>
              <th style={{ ...label, textAlign: "right", padding: "8px 0", borderBottom: `1.5px solid ${C.ink}` }}>{t.amount}</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i}>
                <td style={{ padding: "7px 0", borderBottom: `1px solid ${C.line}` }}>{lineLabel(l, lang, multiMonth)}</td>
                <td style={{ ...num, padding: "7px 0", borderBottom: `1px solid ${C.line}` }}>{formatINR(l.paise)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: "8px 0", fontWeight: 700 }}>{t.totalDue}</td>
              <td style={{ ...num, padding: "8px 0", fontWeight: 700 }}>{formatINR(data.totalDuePaise)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Received + seal */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12, padding: "6px 32px 0" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "10px 14px", background: C.indigo, color: "#fff", borderRadius: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t.received}</span>
            <span style={{ ...num, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{formatINR(data.receivedPaise)}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 3, marginTop: 10, fontSize: 12 }}>
            <span style={{ color: C.muted }}>{t.mode}</span>
            <span style={{ fontWeight: 600 }}>
              {t.modes[data.mode]}
              {data.reference ? <span style={{ color: C.muted, fontWeight: 400 }}> · {t.reference} {data.reference}</span> : null}
            </span>
            <span style={{ color: C.muted }}>{t.receivedBy}</span>
            <span style={{ fontWeight: 600 }}>{isHi && data.receivedBy.hi ? data.receivedBy.hi : data.receivedBy.en}</span>
            <span style={{ color: C.muted }}>{t.balance}</span>
            <span style={{ ...num, textAlign: "left", fontWeight: 700, color: partial ? C.amber : C.green }}>{formatINR(data.balanceAfterPaise)}</span>
          </div>
        </div>
        <Seal lang={lang} partial={partial} voided={data.voided} />
      </section>

      {/* Amount in words */}
      <section style={{ margin: "14px 32px 0", padding: "10px 14px", background: C.tint, borderRadius: 10, borderLeft: `3px solid ${C.marigold}` }}>
        <div style={label}>{t.inWords}</div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{amountInWords(data.receivedPaise, lang)}</div>
      </section>

      {/* Challan */}
      {challans.length > 0 && (
        <section style={{ margin: "10px 32px 0", fontSize: 12, color: C.muted }}>
          {challans.map((c) => (
            <div key={c.month}>
              <span style={{ fontWeight: 600, color: C.ink }}>{t.challan}</span>
              {multiMonth && ` (${formatMonth(c.month, lang)})`}
              {c.paidOn && ` · ${formatDate(c.paidOn)}`}
              {c.pfTrrn && <> · {t.trrn} <span style={{ ...num, color: C.ink }}>{c.pfTrrn}</span></>}
              {c.esicChallanNo && <> · {t.esicNo} <span style={{ ...num, color: C.ink }}>{c.esicChallanNo}</span></>}
            </div>
          ))}
        </section>
      )}

      {/* Signature */}
      <section style={{ display: "flex", justifyContent: "flex-end", padding: "18px 32px 0" }}>
        <div style={{ textAlign: "center", minWidth: 170 }}>
          <div style={{ height: 46, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {data.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.signatureUrl} alt="" style={{ maxHeight: 46, maxWidth: 160, objectFit: "contain" }} />
            ) : null}
          </div>
          <div style={{ borderTop: `1px solid ${C.ink}`, paddingTop: 4, fontSize: 11, color: C.muted }}>
            {t.sign}
            <div style={{ fontSize: 11, color: C.ink, fontWeight: 600 }}>{isHi ? data.business.nameHi : data.business.nameEn}</div>
          </div>
        </div>
      </section>

      <footer style={{ margin: "16px 0 0", padding: "10px 32px 14px", borderTop: `1px dashed ${C.line}`, textAlign: "center", fontSize: 11, color: C.muted }}>
        {t.footer}
      </footer>
      <div style={{ height: 6, background: C.indigo }} />

      {data.voided && (
        <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <span style={{ fontSize: 120, fontWeight: 900, color: C.rose, opacity: 0.12, transform: "rotate(-24deg)", letterSpacing: "0.1em" }}>VOID</span>
        </div>
      )}
    </article>
  );
}
