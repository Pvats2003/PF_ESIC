import { expect, it } from "vitest";
import { parsePeriod } from "@/lib/domain/period";

it("defaults to this financial year so far", () => {
  expect(parsePeriod(undefined, undefined, "2026-11-23")).toEqual({ from: "2026-04-01", to: "2026-11-30" });
  expect(parsePeriod(undefined, undefined, "2027-02-10")).toEqual({ from: "2026-04-01", to: "2027-02-28" });
});
it("reads months from the URL and ends on the month's last day", () => {
  expect(parsePeriod("2026-10", "2026-12", "2026-11-23")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  expect(parsePeriod("bad", "2026-02", "2026-11-23")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
});
