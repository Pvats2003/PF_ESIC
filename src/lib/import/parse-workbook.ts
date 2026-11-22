/**
 * Parses the monthly Excel workbook into plain, typed rows. Pure: it works on
 * a simple grid of cells, so it is unit-tested without Excel. The adapter in
 * scripts/import-excel.ts turns an exceljs workbook into these grids.
 *
 * Nothing is decided about client identity here; every row keeps its cell
 * reference (e.g. "SEPT26!B45") so the import is traceable and idempotent.
 */
import { addMonths, type ISODate } from "@/lib/format/dates";
import { cleanCell, normalizeName, splitNameAndService } from "./normalize";

export type CellValue = string | number | Date | null;
export interface Cell {
  v: CellValue; // value (formula result for formula cells)
  f?: string; // formula text, without "="
}
export interface SheetGrid {
  name: string;
  rows: Cell[][]; // rows[r][c], 0-based; rows[0][0] is A1
}

export interface ClientRow {
  ref: string; // sheet!B12
  row: number; // 1-based Excel row
  rawName: string;
  pfPaise: number | null;
  esicPaise: number | null;
  chargePaise: number | null; // null = cell left blank
  remark: string | null; // A / R / N / NA / D / 0
  repeatInSheet: boolean; // same name already appeared above in this sheet's client rows
}

export type ServiceType = "pf_claim" | "registration" | "appointment_letter" | "pf_password" | "pf_card" | "challan" | "monthly_fee" | "other";

export interface ExtraRow {
  ref: string;
  row: number;
  rawName: string;
  name: string; // name with any service words removed
  description: string | null;
  amountPaise: number;
  partnerCode: "A" | "R" | null;
  date: ISODate | null;
  serviceType: ServiceType;
  /** Wage months a "PF & ESIC <month>" line refers to (empty when none written). */
  refersToMonths: ISODate[];
  possibleExpense: boolean;
}

export interface SideNote {
  ref: string;
  kind: "expense" | "adjustment";
  label: string;
  amountPaise: number;
  formula?: string;
}

export interface ParsedSheet {
  sheetName: string;
  month: ISODate | null;
  listOnly: boolean; // no charges at all (Sheet1 July list, the not-yet-filled current month)
  clientRows: ClientRow[];
  total: { ref: string; formula: string | null; valuePaise: number | null } | null;
  extras: ExtraRow[];
  extrasSubtotal: { ref: string; valuePaise: number | null } | null;
  sideNotes: SideNote[];
  warnings: string[];
}

const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const col = (c: number) => COLS[c];
const at = (g: SheetGrid, r: number, c: number): Cell => g.rows[r]?.[c] ?? { v: null };
const ref = (g: SheetGrid, r: number, c: number) => `${g.name.trim()}!${col(c)}${r + 1}`;

function toISO(d: Date): ISODate {
  // Excel dates arrive as UTC midnight
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Whole-rupee or decimal numbers → paise; strings like "1,500.00" too. Anything else → null. */
export function toPaise(v: CellValue): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v === "string") {
    const s = v.replace(/[,₹\s`]/g, "");
    if (/^\d+(\.\d{1,2})?$/.test(s)) return Math.round(Number(s) * 100);
  }
  return null;
}

const isTotalLabel = (v: CellValue) => typeof v === "string" && /^\s*(grand\s+)?total\s*$/i.test(v);

const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

/**
 * "PF & ESIC-MAR-26" → [2026-03-01]; "PF & ESIC - June & July-26" → [2026-06-01, 2026-07-01];
 * "PF & ESIC-July-26 AUG-26 & Sep-26" → three months. Month without a year takes the next year written,
 * else the sheet's year.
 */
export function monthsReferenced(text: string, sheetMonth: ISODate | null): ISODate[] {
  if (!/\b(PF|ESIC)\b/i.test(text)) return [];
  const re = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*[-–]?\s*(\d{2})?\b/gi;
  const found: Array<{ m: number; y: number | null }> = [];
  for (const m of text.matchAll(re)) found.push({ m: MONTHS[m[1].toUpperCase()], y: m[2] ? 2000 + Number(m[2]) : null });
  const fallbackYear = sheetMonth ? Number(sheetMonth.slice(0, 4)) : null;
  const out: ISODate[] = [];
  for (let i = 0; i < found.length; i++) {
    const y = found[i].y ?? found.slice(i + 1).find((x) => x.y)?.y ?? fallbackYear;
    if (!y) continue;
    out.push(`${y}-${String(found[i].m).padStart(2, "0")}-01`);
  }
  return [...new Set(out)];
}

export function classifyService(text: string): ServiceType {
  const t = text.toUpperCase();
  if (/CLAIM/.test(t)) return "pf_claim";
  if (/APPOINTMENT/.test(t)) return "appointment_letter";
  if (/PASSWORD/.test(t)) return "pf_password";
  if (/CARD/.test(t)) return "pf_card";
  if (/REG[IU]S?T|REGISTRATION|\bCODE\b/.test(t)) return "registration";
  if (/\b(PF|ESIC)\b.*\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/.test(t)) return "monthly_fee";
  if (/CHALLAN|NIL/.test(t)) return "challan";
  return "other";
}

const EXPENSE_WORDS = /^(INK|PAPER|ADOPTER|ADAPTER|HUB|CARTRIDGE|TONER|PRINTER|STATIONERY)\b/i;

/** "1 RAJ ENGINEERING- 50.00" → { name: "RAJ ENGINEERING", amount: 5000 } */
export function parseInlineAmount(text: string): { name: string; amountPaise: number } | null {
  const m = /^\s*(?:\d{1,3}\s*[.)]?\s*)?(.+?)\s*[-–]\s*([\d,]+(?:\.\d{1,2})?)\s*$/.exec(text);
  if (!m) return null;
  const amountPaise = toPaise(m[2]);
  return amountPaise === null ? null : { name: m[1].trim(), amountPaise };
}

export function parseSheet(g: SheetGrid): ParsedSheet {
  const warnings: string[] = [];
  const a1 = at(g, 0, 0).v;
  const month = a1 instanceof Date ? toISO(new Date(Date.UTC(a1.getUTCFullYear(), a1.getUTCMonth(), 1))) : null;
  if (!month) warnings.push(`A1 is not a date (${String(a1)}); this sheet's month is unknown`);

  const headerRow = g.rows.findIndex((r) => typeof r?.[0]?.v === "string" && /SL\.?\s*NO/i.test(String(r[0].v)));
  if (headerRow < 0) {
    return { sheetName: g.name, month, listOnly: true, clientRows: [], total: null, extras: [], extrasSubtotal: null, sideNotes: [], warnings: [...warnings, "No 'SL. NO.' header row"] };
  }

  // ── Client rows: from the header until the row whose column B says TOTAL ──
  const clientRows: ClientRow[] = [];
  const seen = new Set<string>();
  let totalRow = -1;
  for (let r = headerRow + 1; r < g.rows.length; r++) {
    const b = at(g, r, 1).v;
    if (isTotalLabel(b)) {
      totalRow = r;
      break;
    }
    const name = cleanCell(b);
    if (!name || b instanceof Date) continue;
    const key = normalizeName(name);
    clientRows.push({
      ref: ref(g, r, 1),
      row: r + 1,
      rawName: String(b),
      pfPaise: toPaise(at(g, r, 2).v),
      esicPaise: toPaise(at(g, r, 3).v),
      chargePaise: toPaise(at(g, r, 5).v),
      remark: cleanCell(at(g, r, 6).v === 0 ? "0" : at(g, r, 6).v),
      repeatInSheet: seen.has(key),
    });
    seen.add(key);
  }

  const total =
    totalRow >= 0
      ? { ref: ref(g, totalRow, 5), formula: at(g, totalRow, 5).f ?? null, valuePaise: toPaise(at(g, totalRow, 5).v) }
      : null;
  if (!total) warnings.push("No TOTAL row found");

  // A SUM over a range that skips client rows (the Nov 26 sheet sums F5:F40 but clients start at row 3)
  if (total?.formula) {
    const m = /SUM\(F(\d+):F(\d+)\)/i.exec(total.formula);
    if (m && clientRows.length) {
      const first = clientRows[0].row;
      const last = clientRows[clientRows.length - 1].row;
      if (Number(m[1]) > first || Number(m[2]) < last) {
        warnings.push(`TOTAL formula =${total.formula} doesn't cover all client rows (${first}–${last}); totals recalculated from the rows`);
      }
    }
  }

  // ── Below TOTAL: one-off charges, expenses and settlement workings ──
  const extras: ExtraRow[] = [];
  const sideNotes: SideNote[] = [];
  let extrasSubtotal: ParsedSheet["extrasSubtotal"] = null;

  for (let r = totalRow + 1; totalRow >= 0 && r < g.rows.length; r++) {
    const row = g.rows[r] ?? [];
    const b = at(g, r, 1).v;

    // Labelled side calculations without a client name: "Ink 1850", "PAPER 220", "TOTAL", "GRAND TOTAL"…
    for (let c = 2; c <= 4; c++) {
      const label = cleanCell(at(g, r, c).v);
      if (!label || typeof at(g, r, c).v !== "string") continue;
      const amountCell = [c + 1, c + 2, c + 3].map((cc) => at(g, r, cc)).find((x) => typeof x.v === "number" && !x.f);
      if (EXPENSE_WORDS.test(label) && amountCell) {
        sideNotes.push({ ref: ref(g, r, c), kind: "expense", label, amountPaise: toPaise(amountCell.v)! });
      }
    }

    if (isTotalLabel(b) || b instanceof Date) {
      const sub = row.slice(2).find((x) => x?.f && /\b(SUM|SUBTOTAL)\(/i.test(x.f));
      if (isTotalLabel(b) && /^\s*total\s*$/i.test(String(b)) && sub) extrasSubtotal = { ref: ref(g, r, row.indexOf(sub)), valuePaise: toPaise(sub.v) };
      continue;
    }

    const text = cleanCell(b);
    if (!text) {
      // A bare SUM under the amounts column with no label is the extras subtotal (SEPT26, OCT 26 style)
      const sub = row.slice(2).find((x) => x?.f && /^SUM\(/i.test(x.f));
      if (sub && !extrasSubtotal) extrasSubtotal = { ref: ref(g, r, row.indexOf(sub)), valuePaise: toPaise(sub.v) };
      continue;
    }

    // Amount: first plain number in C..F (formulas there are workings, not charges)
    let amountPaise: number | null = null;
    let description: string | null = null;
    let partnerCode: "A" | "R" | null = null;
    let date: ISODate | null = null;
    for (let c = 2; c <= 6; c++) {
      const cell = at(g, r, c);
      if (cell.f) continue;
      if (typeof cell.v === "number" && amountPaise === null) amountPaise = toPaise(cell.v);
      else if (cell.v instanceof Date && !date) date = toISO(cell.v);
      else if (typeof cell.v === "string") {
        const s = cell.v.trim();
        if (/^[AR]$/.test(s)) partnerCode = s as "A" | "R";
        else if (!description && c === 2) description = s;
      }
    }

    let name = text;
    if (amountPaise === null) {
      const inline = parseInlineAmount(text);
      if (!inline) {
        warnings.push(`${ref(g, r, 1)}: "${text}" below TOTAL has no amount; skipped`);
        continue;
      }
      name = inline.name;
      amountPaise = inline.amountPaise;
    }

    const split = splitNameAndService(name);
    const serviceText = [split.service, description].filter(Boolean).join(" ");
    const refersToMonths = monthsReferenced(serviceText, month);
    const possibleExpense = EXPENSE_WORDS.test(split.name) && !serviceText;
    extras.push({
      ref: ref(g, r, 1),
      row: r + 1,
      rawName: text,
      name: split.name,
      description: [split.service, description].filter(Boolean).join(" · ") || null,
      amountPaise,
      partnerCode,
      date,
      serviceType: possibleExpense ? "other" : refersToMonths.length ? "monthly_fee" : classifyService(serviceText || name),
      refersToMonths,
      possibleExpense,
    });
  }

  // ── Settlement workings anywhere on the sheet: "=F43-3400", "=F39+E48-200" ──
  g.rows.forEach((row, r) =>
    row?.forEach((cell, c) => {
      if (!cell?.f) return;
      for (const m of cell.f.matchAll(/-\s*(\d+(?:\.\d+)?)(?![\d.]*\s*[:)])/g)) {
        const amt = toPaise(Number(m[1]));
        if (amt) sideNotes.push({ ref: ref(g, r, c), kind: "adjustment", label: `=${cell.f}`, amountPaise: amt, formula: cell.f });
      }
    }),
  );

  const listOnly = clientRows.every((x) => x.chargePaise === null && x.pfPaise === null && x.esicPaise === null);
  return { sheetName: g.name, month, listOnly, clientRows, total, extras, extrasSubtotal, sideNotes, warnings };
}

/** Months in the workbook, newest last, and which sheet each came from. Flags duplicates. */
export function orderSheets(sheets: ParsedSheet[]): { ordered: ParsedSheet[]; warnings: string[] } {
  const warnings: string[] = [];
  const byMonth = new Map<string, ParsedSheet>();
  for (const s of sheets) {
    if (!s.month) continue;
    const prev = byMonth.get(s.month);
    if (prev) warnings.push(`Sheets "${prev.sheetName}" and "${s.sheetName}" both say ${s.month} in A1`);
    else byMonth.set(s.month, s);
  }
  const ordered = [...byMonth.values()].sort((a, b) => (a.month! < b.month! ? -1 : 1));
  for (let i = 1; i < ordered.length; i++) {
    if (addMonths(ordered[i - 1].month!, 1) !== ordered[i].month) warnings.push(`No sheet for the month after ${ordered[i - 1].month}`);
  }
  return { ordered, warnings };
}
