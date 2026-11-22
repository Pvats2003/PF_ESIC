import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Reads the design tokens straight from globals.css so this test can't drift from them. */
function tokens(block: ":root" | ".dark"): Record<string, string> {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const start = css.indexOf(`${block} {`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2];
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [text token, background token] pairs actually used in the UI. 4.5:1 = WCAG AA for body text.
const PAIRS: Array<[string, string]> = [
  ["ink", "paper"], ["ink", "surface"], ["ink", "surface-2"],
  ["ink-muted", "paper"], ["ink-muted", "surface"], ["ink-muted", "surface-2"],
  ["ink-faint", "paper"], ["ink-faint", "surface"],
  ["primary-ink", "primary"], ["primary-ink", "primary-hover"],
  ["primary-text", "paper"], ["primary-text", "surface"], ["primary-text", "primary-soft"],
  ["accent-text", "paper"], ["accent-text", "surface"], ["accent-text", "accent-soft"],
  ["success", "success-soft"], ["success", "surface"],
  ["warning", "warning-soft"], ["warning", "surface"],
  ["danger", "danger-soft"], ["danger", "surface"],
  ["neutral", "neutral-soft"], ["neutral", "surface"],
  ["info", "info-soft"], ["info", "surface"],
];

for (const theme of [":root", ".dark"] as const) {
  describe(`WCAG AA contrast — ${theme === ":root" ? "light" : "dark"} theme`, () => {
    const t = tokens(theme);
    it.each(PAIRS)("%s on %s ≥ 4.5:1", (fg, bg) => {
      expect(t[fg], `missing --${fg}`).toBeDefined();
      expect(t[bg], `missing --${bg}`).toBeDefined();
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });
  });
}
