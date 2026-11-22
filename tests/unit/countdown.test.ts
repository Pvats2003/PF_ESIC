import { describe, expect, it } from "vitest";
import { countdown } from "@/lib/domain/countdown";

describe("due-date countdown", () => {
  it.each([
    ["2026-12-09", "calm", "Due 15 Dec: 6 days left"],
    ["2026-12-10", "soon", "Due 15 Dec: 5 days left"],
    ["2026-12-12", "soon", "Due 15 Dec: 3 days left"],
    ["2026-12-13", "urgent", "Due 15 Dec: 2 days left"],
    ["2026-12-14", "urgent", "Due tomorrow, 15 Dec"],
    ["2026-12-15", "urgent", "Due today, 15 Dec"],
    ["2026-12-16", "overdue", "Overdue by 1 day"],
    ["2026-12-20", "overdue", "Overdue by 5 days"],
  ])("on %s → %s", (today, tone, label) => {
    const c = countdown(today, "2026-12-15");
    expect(c.tone).toBe(tone);
    expect(c.label).toBe(label);
  });
});
