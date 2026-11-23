import { addDays, addMonths, financialYear, monthStart, todayIST, type ISODate } from "@/lib/format/dates";

/** "2026-04" → first day; for `to`, the last day of that month. Default: this financial year so far. */
export function parsePeriod(fromParam: unknown, toParam: unknown, today: ISODate = todayIST()): { from: ISODate; to: ISODate } {
  const ok = (v: unknown) => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? `${v}-01` : null);
  const fyStart = `${financialYear(today).slice(0, 4)}-04-01`;
  const from = ok(fromParam) ?? fyStart;
  const toMonth = ok(toParam) ?? monthStart(today);
  const to = addDays(addMonths(toMonth, 1), -1);
  return from <= to ? { from, to } : { from: monthStart(to), to };
}
