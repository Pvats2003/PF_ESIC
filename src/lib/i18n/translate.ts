/**
 * Screen language. The English text itself is the key: `t("Record payment")`.
 * Hindi lives in ./hi.ts; anything missing falls back to English (and a unit
 * test lists every t("…") in src that has no Hindi yet).
 * Placeholders: `t("{n} clients", { n: 4 })`.
 */
import { HI, HI_PATTERNS } from "./hi";

export type UiLang = "en" | "hi";
export type Vars = Record<string, string | number>;

export function translate(lang: UiLang, key: string, vars?: Vars): string {
  const text = lang === "hi" ? (HI[key] ?? fromPattern(key) ?? key) : key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Messages with a value inside them (e.g. the number someone typed) are matched by pattern. */
function fromPattern(key: string): string | undefined {
  for (const [re, hi] of HI_PATTERNS) if (re.test(key)) return key.replace(re, hi);
  return undefined;
}

export type T = (key: string, vars?: Vars) => string;

export const LANG_COOKIE = "pfesic-lang";
export const LANG_STORAGE = "pfesic:lang";
