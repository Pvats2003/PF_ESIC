import { describe, expect, it } from "vitest";
import { formatINR, formatINRCompact, parseRupeesToPaise, sumPaise } from "@/lib/format/money";

describe("formatINR", () => {
  it.each([
    [0, "₹0"],
    [50_000, "₹500"],
    [1_47_555_00, "₹1,47,555"],
    [2_76_461_00, "₹2,76,461"],
    [1_00_00_000_00, "₹1,00,00,000"],
    [14_741_50, "₹14,741.50"],
    [5, "₹0.05"],
    [-1_250_00, "−₹1,250"],
  ])("%i paise → %s", (p, s) => expect(formatINR(p)).toBe(s));

  it("rejects floats", () => expect(() => formatINR(10.5)).toThrow());
});

describe("formatINRCompact", () => {
  it.each([
    [95_000, "₹950"],
    [45_200_00, "₹45.2K"],
    [1_50_000_00, "₹1.5 L"],
    [1_47_555_00, "₹1.47 L"],
    [2_30_00_000_00, "₹2.3 Cr"],
  ])("%i → %s", (p, s) => expect(formatINRCompact(p)).toBe(s));
});

describe("parseRupeesToPaise", () => {
  it.each([
    ["500", 50_000],
    ["1,47,555", 1_47_555_00],
    ["₹ 14,741.00", 14_741_00],
    ["12.5", 1_250],
    ["0", 0],
    [" 7462 ", 7_462_00],
  ])("%s", (input, p) => expect(parseRupeesToPaise(input)).toBe(p));

  it.each(["", "abc", "-5", "1.234", "`", "12..5"])("rejects %j", (input) => expect(parseRupeesToPaise(input)).toBeNull());
});

describe("sumPaise", () => {
  it("adds integers and skips nulls", () => expect(sumPaise([100, null, 250, undefined, 0])).toBe(350));
  it("matches the March 2025 paper sheet total (PF + ESIC)", () => {
    const pf = [15674, 12310, 7462, 30750, 15329, 4185, 6960, 2721, 19903, 9179, 41301, 1643, 71303];
    const esic = [2479, 1931, 1139, 4923, 2425, 604, 1057, 363, 3173, 1419, 6617, 189, 11422];
    expect(sumPaise(pf.map((r) => r * 100))).toBe(238720_00);
    expect(sumPaise(esic.map((r) => r * 100))).toBe(37741_00);
  });
});
