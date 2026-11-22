/**
 * Dates. Everything is Asia/Kolkata. Calendar dates are plain "YYYY-MM-DD"
 * strings (matching Postgres `date`), never JS Date objects, so there are
 * no timezone surprises. A wage month is stored as its first day: "2026-11-01".
 */

export const TZ = "Asia/Kolkata";

export type ISODate = string; // YYYY-MM-DD

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const MONTHS_EN_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"] as const;

export type Lang = "en" | "hi";

function parts(d: ISODate): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new RangeError(`Not an ISO date: ${d}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function iso(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Today's calendar date in India, whatever the server's timezone. */
export function todayIST(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function monthStart(d: ISODate): ISODate {
  const [y, m] = parts(d);
  return iso(y, m, 1);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, day] = parts(d);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return iso(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

/** Due date for a wage month: `dueDay` of the following month (clamped to month length). */
export function dueDateFor(wageMonth: ISODate, dueDay = 15): ISODate {
  const next = addMonths(monthStart(wageMonth), 1);
  const [y, m] = parts(next);
  return iso(y, m, Math.min(Math.max(1, dueDay), daysInMonth(y, m)));
}

export function addDays(d: ISODate, n: number): ISODate {
  const [y, m, day] = parts(d);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(from: ISODate, to: ISODate): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** 15/12/2026 */
export function formatDate(d: ISODate): string {
  const [y, m, day] = parts(d);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** "15 Dec" (en) / "15 दिसंबर" (hi) */
export function formatDayMonth(d: ISODate, lang: Lang = "en"): string {
  const [, m, day] = parts(d);
  return `${day} ${lang === "hi" ? MONTHS_HI[m - 1] : MONTHS_EN_SHORT[m - 1]}`;
}

/** "November 2026" / "नवंबर 2026" */
export function formatMonth(d: ISODate, lang: Lang = "en"): string {
  const [y, m] = parts(d);
  return `${lang === "hi" ? MONTHS_HI[m - 1] : MONTHS_EN[m - 1]} ${y}`;
}

/** "Nov 26" — compact, like the Excel sheet names. */
export function formatMonthShort(d: ISODate): string {
  const [y, m] = parts(d);
  return `${MONTHS_EN_SHORT[m - 1]} ${String(y).slice(2)}`;
}

/** Indian financial year (April–March) for a date: "2026-27". */
export function financialYear(d: ISODate): string {
  const [y, m] = parts(d);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** R/2026-27/0001 */
export function formatReceiptNo(fy: string, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("Receipt number must be a positive integer");
  return `R/${fy}/${String(n).padStart(4, "0")}`;
}

/**
 * The wage month being worked on today. Wages for a month are filed during
 * the following month (November wages → filed in December, due 15 Dec),
 * so the default is the previous calendar month.
 */
export function currentWageMonth(today: ISODate = todayIST()): ISODate {
  return addMonths(monthStart(today), -1);
}
