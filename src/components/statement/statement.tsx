/**
 * Client account statement for a period (usually a financial year), as a
 * printable document. Same approach as the receipt: HTML with a fixed paper
 * palette, captured to PNG/PDF so Hindi renders correctly.
 */
import { formatDate, formatMonth, type ISODate, type Lang } from "@/lib/format/dates";
import { formatINR } from "@/lib/format/money";
import { formatIndianPhone } from "@/lib/format/phone";

export interface StatementData {
  client: { id: string; firm_name: string; firm_name_hi: string | null; owner_name: string | null; pf_code: string | null; esic_code: string | null; preferred_language: Lang; phone: string | null; whatsapp_phone: string | null };
  business: { name_en: string; name_hi: string; address_en: string; address_hi: string; phones: string[] };
  from: ISODate;
  to: ISODate;
  opening: number;
  months: Array<{ wage_month: ISODate; challan_payer: "us" | "client"; pf: number | null; esic: number | null; charge: number; extras: number; due: number; received: number; owes: number; pf_trrn: string | null; esic_no: string | null }>;
  payments: Array<{ received_on: ISODate; amount: number; mode: "cash" | "upi" | "bank"; receipt_no: string | null }>;
  closing: number;
  advance: number;
}

const T = {
  en: { title: "Account Statement", period: "Period", client: "Client", owner: "Proprietor", opening: "Owed before this period", month: "Month", pf: "PF", esic: "ESIC", fee: "Fee", due: "Due to us", recd: "Received", owes: "Owes", trrn: "PF TRRN", payments: "Payments received", date: "Date", amount: "Amount", mode: "Mode", receipt: "Receipt", closing: "Balance owed", advance: "Advance held", none: "No payments in this period", clientPays: "client pays challan", footer: "This is an account statement, not a tax invoice." },
  hi: { title: "खाता विवरण", period: "अवधि", client: "ग्राहक", owner: "प्रोप्राइटर", opening: "पिछली बकाया राशि", month: "माह", pf: "PF", esic: "ESIC", fee: "शुल्क", due: "देय", recd: "प्राप्त", owes: "बकाया", trrn: "PF TRRN", payments: "प्राप्त भुगतान", date: "दिनांक", amount: "राशि", mode: "माध्यम", receipt: "रसीद", closing: "कुल बकाया", advance: "अग्रिम जमा", none: "इस अवधि में कोई भुगतान नहीं", clientPays: "चालान ग्राहक जमा करता है", footer: "यह खाता विवरण है, कर बीजक नहीं।" },
} as const;
const MODE = { en: { cash: "Cash", upi: "UPI", bank: "Bank" }, hi: { cash: "नकद", upi: "UPI", bank: "बैंक" } } as const;
const C = { paper: "#fffdf9", ink: "#161a23", muted: "#5a6070", line: "#e6dfd3", indigo: "#1e2a5a", marigold: "#e8a33d", tint: "#f6f1e7", amber: "#9a5b00", green: "#0b7a55" };

export function Statement({ d, lang }: { d: StatementData; lang: Lang }) {
  const t = T[lang];
  const isHi = lang === "hi";
  const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums", textAlign: "right", whiteSpace: "nowrap" };
  const th: React.CSSProperties = { fontSize: 10.5, color: C.muted, fontWeight: 600, padding: "7px 6px", borderBottom: `1.5px solid ${C.ink}`, textAlign: "right" };
  const td: React.CSSProperties = { padding: "6px", borderBottom: `1px solid ${C.line}`, fontSize: 12 };
  const amt = (p: number | null) => (p === null ? "—" : formatINR(p));
  const totals = d.months.reduce((a, m) => ({ due: a.due + m.due, recd: a.recd + m.received }), { due: 0, recd: 0 });
  return (
    <article data-statement lang={lang} style={{
      width: 760, background: C.paper, color: C.ink, borderRadius: 6, overflow: "hidden",
      fontFamily: isHi ? "var(--font-devanagari), var(--font-jakarta), sans-serif" : "var(--font-jakarta), var(--font-devanagari), sans-serif",
      boxShadow: "0 1px 2px rgb(0 0 0 / 0.05), 0 16px 40px -12px rgb(0 0 0 / 0.18)",
    }}>
      <div style={{ height: 8, background: C.indigo }} />
      <header style={{ padding: "20px 32px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `1px solid ${C.line}` }}>
        <div>
          <div lang="hi" style={{ fontFamily: "var(--font-devanagari), sans-serif", fontSize: 22, fontWeight: 700, color: C.indigo }}>{d.business.name_hi}</div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", color: C.indigo }}>{d.business.name_en.toUpperCase()}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{[isHi ? d.business.address_hi || d.business.address_en : d.business.address_en, d.business.phones.map(formatIndianPhone).join(" · ")].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{t.title}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{t.period}: {formatDate(d.from)} – {formatDate(d.to)}</div>
        </div>
      </header>
      <section style={{ padding: "14px 32px", display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted }}>{t.client}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{isHi && d.client.firm_name_hi ? d.client.firm_name_hi : d.client.firm_name}</div>
          {d.client.owner_name && <div style={{ fontSize: 12, color: C.muted }}>{t.owner}: {d.client.owner_name}</div>}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{[d.client.pf_code && `PF ${d.client.pf_code}`, d.client.esic_code && `ESIC ${d.client.esic_code}`].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ textAlign: "right", background: C.tint, borderRadius: 10, padding: "8px 14px", alignSelf: "flex-start" }}>
          <div style={{ fontSize: 11, color: C.muted }}>{t.opening}</div>
          <div style={{ ...num, fontSize: 16, fontWeight: 700 }}>{formatINR(d.opening)}</div>
        </div>
      </section>
      <section style={{ padding: "0 32px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>{t.month}</th><th style={th}>{t.pf}</th><th style={th}>{t.esic}</th><th style={th}>{t.fee}</th>
            <th style={th}>{t.due}</th><th style={th}>{t.recd}</th><th style={th}>{t.owes}</th><th style={{ ...th, textAlign: "left" }}>{t.trrn}</th>
          </tr></thead>
          <tbody>
            {d.months.map((m) => (
              <tr key={m.wage_month}>
                <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{formatMonth(m.wage_month, lang)}{m.challan_payer === "client" && <div style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}>{t.clientPays}</div>}</td>
                <td style={{ ...td, ...num }}>{amt(m.pf)}</td><td style={{ ...td, ...num }}>{amt(m.esic)}</td><td style={{ ...td, ...num }}>{formatINR(m.charge + m.extras)}</td>
                <td style={{ ...td, ...num }}>{formatINR(m.due)}</td><td style={{ ...td, ...num, color: C.green }}>{formatINR(m.received)}</td>
                <td style={{ ...td, ...num, fontWeight: 700, color: m.owes ? C.amber : C.ink }}>{formatINR(m.owes)}</td>
                <td style={{ ...td, fontSize: 11, color: C.muted }}>{m.pf_trrn ?? "—"}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, fontWeight: 700, borderBottom: "none" }} colSpan={4} />
              <td style={{ ...td, ...num, fontWeight: 700, borderBottom: "none" }}>{formatINR(totals.due)}</td>
              <td style={{ ...td, ...num, fontWeight: 700, borderBottom: "none" }}>{formatINR(totals.recd)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </section>
      <section style={{ padding: "10px 32px 0", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{t.payments}</div>
          {d.payments.length === 0 ? <div style={{ fontSize: 12, color: C.muted }}>{t.none}</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {d.payments.map((p, i) => (
                  <tr key={i}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{formatDate(p.received_on)}</td>
                    <td style={{ ...td, color: C.muted }}>{MODE[lang][p.mode]}</td>
                    <td style={{ ...td, color: C.muted, fontSize: 11 }}>{p.receipt_no ?? ""}</td>
                    <td style={{ ...td, ...num, fontWeight: 600 }}>{formatINR(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ alignSelf: "end" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: C.indigo, color: "#fff", borderRadius: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t.closing}</span>
            <span style={{ ...num, fontSize: 18, fontWeight: 800 }}>{formatINR(d.closing)}</span>
          </div>
          {d.advance > 0 && <div style={{ fontSize: 12, color: C.muted, marginTop: 6, textAlign: "right" }}>{t.advance}: <strong style={{ color: C.ink }}>{formatINR(d.advance)}</strong></div>}
        </div>
      </section>
      <footer style={{ margin: "18px 0 0", padding: "10px 32px 14px", borderTop: `1px dashed ${C.line}`, textAlign: "center", fontSize: 11, color: C.muted }}>{t.footer}</footer>
      <div style={{ height: 6, background: C.marigold }} />
    </article>
  );
}
