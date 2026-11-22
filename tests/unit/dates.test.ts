import { describe, expect, it } from "vitest";
import {
  addMonths, currentWageMonth, daysBetween, dueDateFor, financialYear, formatDate,
  formatDayMonth, formatMonth, formatReceiptNo, todayIST,
} from "@/lib/format/dates";

describe("due dates", () => {
  it("March wages are due 15 April", () => expect(dueDateFor("2025-03-01")).toBe("2025-04-15"));
  it("November wages are due 15 December", () => expect(dueDateFor("2026-11-01")).toBe("2026-12-15"));
  it("December wages roll into the next year", () => expect(dueDateFor("2026-12-01")).toBe("2027-01-15"));
  it("clamps a due day of 31 to the month's length", () => expect(dueDateFor("2027-01-01", 31)).toBe("2027-02-28"));
  it("respects a custom due day", () => expect(dueDateFor("2026-11-01", 10)).toBe("2026-12-10"));
});

describe("financial year and receipt numbers", () => {
  it("31 March belongs to the old year, 1 April to the new", () => {
    expect(financialYear("2027-03-31")).toBe("2026-27");
    expect(financialYear("2027-04-01")).toBe("2027-28");
  });
  it("handles the century-style suffix", () => expect(financialYear("2099-06-01")).toBe("2099-00"));
  it("formats receipt numbers", () => {
    expect(formatReceiptNo("2026-27", 1)).toBe("R/2026-27/0001");
    expect(formatReceiptNo("2026-27", 12345)).toBe("R/2026-27/12345");
    expect(() => formatReceiptNo("2026-27", 0)).toThrow();
  });
});

describe("IST", () => {
  it("uses India's date even when UTC is still the previous day", () => {
    // 20:00 UTC on 31 March = 01:30 IST on 1 April
    expect(todayIST(new Date("2027-03-31T20:00:00Z"))).toBe("2027-04-01");
  });
  it("current wage month is the previous calendar month", () => {
    expect(currentWageMonth("2026-11-22")).toBe("2026-10-01");
    expect(currentWageMonth("2027-01-05")).toBe("2026-12-01");
  });
});

describe("formatting", () => {
  it("DD/MM/YYYY", () => expect(formatDate("2026-12-15")).toBe("15/12/2026"));
  it("short day + month", () => {
    expect(formatDayMonth("2026-12-15")).toBe("15 Dec");
    expect(formatDayMonth("2026-12-15", "hi")).toBe("15 दिसंबर");
  });
  it("month names", () => {
    expect(formatMonth("2026-02-01", "hi")).toBe("फ़रवरी 2026");
    expect(formatMonth("2026-11-01")).toBe("November 2026");
  });
  it("month arithmetic", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(daysBetween("2026-12-09", "2026-12-15")).toBe(6);
    expect(daysBetween("2026-12-16", "2026-12-15")).toBe(-1);
  });
});
