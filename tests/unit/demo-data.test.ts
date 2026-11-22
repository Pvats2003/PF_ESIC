import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/lib/demo/demo-data";
import { normalizeIndianPhone } from "@/lib/format/phone";

describe("demo data", () => {
  const d = buildDemoData();
  it("is deterministic", () => expect(buildDemoData()).toEqual(d));
  it("has 38 uniquely named clients with valid phones and codes", () => {
    expect(d.clients).toHaveLength(38);
    expect(new Set(d.clients.map((c) => c.firmName)).size).toBe(38);
    for (const c of d.clients) {
      expect(normalizeIndianPhone(c.phone)).toBe(c.phone);
      expect(c.esicCode).toMatch(/^\d{17}$/);
      expect(Number.isSafeInteger(c.chargePaise)).toBe(true);
    }
  });
  it("has one record per client per month, all whole paise", () => {
    expect(d.records).toHaveLength(38 * 3);
    for (const r of d.records) {
      for (const v of [r.pfPaise, r.esicPaise, r.chargePaise]) if (v !== null) expect(Number.isSafeInteger(v)).toBe(true);
      expect(r.dueDate > r.month).toBe(true);
    }
  });
  it("can be built at 200 clients for load testing", () => {
    expect(buildDemoData(7, 200).clients).toHaveLength(200);
  });
});
