import { describe, expect, it } from "vitest";
import { formatIndianPhone, normalizeIndianPhone, waMeNumber } from "@/lib/format/phone";

describe("normalizeIndianPhone", () => {
  it.each([
    ["9430449312", "+919430449312"],
    ["+91 94304 49312", "+919430449312"],
    ["91-9430449312", "+919430449312"],
    ["09430449312", "+919430449312"],
    ["(943) 044-9312", "+919430449312"],
    ["0919430449312", "+919430449312"],
  ])("%s", (input, out) => expect(normalizeIndianPhone(input)).toBe(out));

  it.each(["", "12345", "1234567890", "+1 415 555 0100", "943044931"])("rejects %j", (input) =>
    expect(normalizeIndianPhone(input)).toBeNull(),
  );
});

it("formats for display and wa.me", () => {
  expect(formatIndianPhone("+919430449312")).toBe("94304 49312");
  expect(waMeNumber("+919430449312")).toBe("919430449312");
});
