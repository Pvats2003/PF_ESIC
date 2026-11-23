import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STATUS_META } from "@/components/ui/status-chip";
import { countdown } from "@/lib/domain/countdown";
import { FILTERS } from "@/lib/domain/board";
import { QUEUE_LABELS } from "@/lib/domain/queue";
import type { BoardRow } from "@/lib/domain/board";
import { HI } from "@/lib/i18n/hi";
import { translate } from "@/lib/i18n/translate";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

/** Every English key the screens ask for: t("…"), t(x ? "…" : "…"), <Tr k="…" />, and the label tables. */
function keysInSource(): Map<string, string> {
  const keys = new Map<string, string>();
  const add = (k: string, where: string) => keys.set(k.replace(/\\"/g, '"'), where);
  for (const p of files("src")) {
    // Receipts and statements carry their own fixed language; status chips have labelHi; the rest is not screen text.
    if (/design|i18n|receipt\/receipt|statement\/statement\.tsx|status-chip|toaster|app\/layout|offline/.test(p)) continue;
    const s = readFileSync(p, "utf8");
    for (const m of s.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) add(m[1], p);
    for (const m of s.matchAll(/\bt\(([^()"]*\?\s*"[^"]*"\s*:[^()]*)\)/g)) for (const q of m[1].matchAll(/"([^"]*)"/g)) add(q[1], p);
    for (const m of s.matchAll(/<Tr k="([^"]*)"/g)) add(m[1], p);
    // Label tables translated where they're shown: { label: "…" }, { title: "…" }, head={["…"]}
    for (const m of s.matchAll(/\b(?:label|title|when|hint|action): "([^"]*[a-z][^"]*)"/g)) add(m[1], p);
    for (const m of s.matchAll(/head=\{\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/"([^"]*)"/g)) add(q[1], p);
  }
  return keys;
}

describe("Hindi screen text", () => {
  it("has Hindi for every piece of screen text", () => {
    const missing = [...keysInSource()].filter(([k]) => !(k in HI)).map(([k, where]) => `${k}   (${where})`);
    expect(missing).toEqual([]);
  });

  it("has Hindi for the quick filters and Today's queue", () => {
    const row = { challan_payer: "us" } as BoardRow;
    const all = [
      ...FILTERS.map((f) => f.label),
      ...Object.values(QUEUE_LABELS).flatMap((q) => [q.title, q.action, q.why(row), q.why({ ...row, challan_payer: "client" })]),
    ];
    expect(all.filter((k) => !(k in HI))).toEqual([]);
  });

  it("keeps every {placeholder} in the Hindi", () => {
    const bad = Object.entries(HI).filter(([en, hi]) => {
      const ph = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join();
      return ph(en) !== ph(hi);
    });
    expect(bad).toEqual([]);
  });

  it("fills placeholders and falls back to English", () => {
    expect(translate("hi", "{n} clients", { n: 4 })).toBe("4 ग्राहक");
    expect(translate("en", "{n} clients", { n: 4 })).toBe("4 clients");
    expect(translate("hi", "Some text nobody translated")).toBe("Some text nobody translated");
  });

  it("status chips and the due-date countdown speak Hindi too", () => {
    expect(Object.values(STATUS_META).every((m) => /[ऀ-ॿ]/.test(m.labelHi))).toBe(true);
    expect(countdown("2026-12-18", "2026-12-15", "hi").label).toBe("3 दिन से अतिदेय");
    expect(countdown("2026-12-10", "2026-12-15", "hi").label).toBe("देय 15 दिसंबर: 5 दिन बाकी");
    expect(countdown("2026-12-15", "2026-12-15", "hi").label).toBe("आज देय, 15 दिसंबर");
  });
});
