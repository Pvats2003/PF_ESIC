import { daysBetween, formatDayMonth, type ISODate } from "@/lib/format/dates";

export type CountdownTone = "calm" | "soon" | "urgent" | "overdue";

/** Due-date countdown: slate until 5 days, marigold at 5, rose at 2 and when overdue. */
export function countdown(today: ISODate, due: ISODate) {
  const days = daysBetween(today, due);
  const tone: CountdownTone = days < 0 ? "overdue" : days <= 2 ? "urgent" : days <= 5 ? "soon" : "calm";
  const when = formatDayMonth(due);
  let label: string;
  if (days < 0) label = `Overdue by ${-days} ${-days === 1 ? "day" : "days"}`;
  else if (days === 0) label = `Due today, ${when}`;
  else if (days === 1) label = `Due tomorrow, ${when}`;
  else label = `Due ${when}: ${days} days left`;
  return { days, tone, label, when };
}
