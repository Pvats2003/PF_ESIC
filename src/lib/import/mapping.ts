/**
 * Suggests which client each raw Excel spelling belongs to. Suggestions only:
 * every medium/low row needs a person's approval in data/client_mapping.csv.
 *
 * Rules (most to least certain):
 *   high   — identical after clean-up (case, spaces, dots, ENGG→ENGINEERING, COLLAGE→COLLEGE…)
 *   medium — one or two words a small typo apart with the same word count
 *            ("BHOJALA MANDAL" ~ "BHOJAL MANDAL"), or a generic extra word ("RAJ ENGINEERING WORKS")
 *   low    — walk-ins, possible expenses, unnamed rows
 * Different word counts never merge, so RAJESH KUMAR ≠ RAJESH KUMAR MALAKAR ≠ RAJESH KUMAR PASWAN.
 */
import type { ISODate } from "@/lib/format/dates";
import { compactKey, isGenericTailVariant, isTypoVariant, normalizeName } from "./normalize";
import type { ParsedSheet } from "./parse-workbook";

export type Section = "client_row" | "below_total" | "vendor_codes" | "list_only";
export interface Occurrence {
  raw: string;
  name: string; // name used for matching (service words removed)
  sheet: string;
  month: ISODate | null;
  section: Section;
  ref: string;
  amountPaise: number | null;
  remark: string | null;
  possibleExpense?: boolean;
}

export type Kind = "client" | "walk_in" | "expense" | "ignore";
export type Confidence = "high" | "medium" | "low";

export interface MappingRow {
  raw_name: string;
  suggested_client: string;
  confidence: Confidence;
  sheets_seen: string;
  kind: Kind;
  reason: string;
  seen_as: string;
  amounts_seen: string;
  latest_charge: string;
  latest_partner: string;
  last_seen: string;
  approve: "yes" | "";
  use_client: string;
  notes: string;
}

export function collectOccurrences(sheets: ParsedSheet[], vendorNames: string[] = []): Occurrence[] {
  const out: Occurrence[] = [];
  for (const s of sheets) {
    for (const r of s.clientRows) {
      out.push({
        raw: r.rawName, name: r.rawName, sheet: s.sheetName.trim(), month: s.month,
        section: s.listOnly && !s.total ? "list_only" : "client_row",
        ref: r.ref, amountPaise: r.chargePaise, remark: r.remark,
      });
    }
    for (const e of s.extras) {
      out.push({
        raw: e.rawName, name: e.name, sheet: s.sheetName.trim(), month: s.month, section: "below_total",
        ref: e.ref, amountPaise: e.amountPaise, remark: e.partnerCode, possibleExpense: e.possibleExpense,
      });
    }
  }
  for (const v of vendorNames) out.push({ raw: v, name: v, sheet: "VENDORCODES", month: null, section: "vendor_codes", ref: `VENDORCODES!${v}`, amountPaise: null, remark: null });
  return out;
}

const tidy = (s: string) => s.replace(/`/g, "").replace(/\s+/g, " ").trim();
const rupees = (p: number) => `₹${new Intl.NumberFormat("en-IN").format(p / 100)}`;

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

export function suggestMapping(occ: Occurrence[]): MappingRow[] {
  // ── 1. Regular clients: anything that appears as a client row (or in VENDORCODES) ──
  const regularNorm = new Map<string, Occurrence[]>(); // normalized → occurrences
  for (const o of occ) {
    if (o.section === "below_total") continue;
    const n = normalizeName(o.name);
    regularNorm.set(n, [...(regularNorm.get(n) ?? []), o]);
  }
  const norms = [...regularNorm.keys()];
  const uf = new UnionFind();
  const linkReason = new Map<string, { reason: string; confidence: Confidence }>();
  norms.forEach((n) => uf.find(n));
  for (let i = 0; i < norms.length; i++) {
    for (let j = i + 1; j < norms.length; j++) {
      const [a, b] = [norms[i], norms[j]];
      if (compactKey(a) === compactKey(b)) uf.union(a, b);
      else if (isGenericTailVariant(a, b) || isTypoVariant(a, b)) {
        uf.union(a, b);
        const why = isGenericTailVariant(a, b) ? "same name plus a generic word" : "same words, small spelling difference";
        linkReason.set(a, { reason: why, confidence: "medium" });
        linkReason.set(b, { reason: why, confidence: "medium" });
      }
    }
  }

  // Canonical display name per cluster: the spelling used most often in client rows, newest on ties
  const clusters = new Map<string, string[]>();
  for (const n of norms) clusters.set(uf.find(n), [...(clusters.get(uf.find(n)) ?? []), n]);
  const canonical = new Map<string, string>(); // member normalized → canonical
  for (const members of clusters.values()) {
    const score = (n: string) => {
      const rows = regularNorm.get(n)!.filter((o) => o.section === "client_row");
      const latest = rows.map((o) => o.month ?? "").sort().at(-1) ?? "";
      return [rows.length, latest] as const;
    };
    const best = [...members].sort((a, b) => {
      const [ca, la] = score(a);
      const [cb, lb] = score(b);
      return cb - ca || (lb > la ? 1 : lb < la ? -1 : 0);
    })[0];
    for (const m of members) canonical.set(m, best);
  }
  const canonicalNames = [...new Set(canonical.values())];
  const byCompact = new Map(norms.map((n) => [compactKey(n), canonical.get(n)!]));

  // ── 2. Walk-ins: names only ever seen below TOTAL, clustered among themselves ──
  const walkNorms = new Set<string>();
  for (const o of occ) if (o.section === "below_total" && !o.possibleExpense) walkNorms.add(normalizeName(o.name));
  const walkUF = new UnionFind();
  const wl = [...walkNorms];
  for (let i = 0; i < wl.length; i++) for (let j = i + 1; j < wl.length; j++) {
    if (compactKey(wl[i]) === compactKey(wl[j]) || isTypoVariant(wl[i], wl[j])) walkUF.union(wl[i], wl[j]);
  }

  // ── 3. One row per distinct raw spelling ──
  const byRaw = new Map<string, Occurrence[]>();
  for (const o of occ) {
    // Spellings that differ only in capitals share a row ("Kamli Sah" / "KAMLI SAH")
    const key = (o.section === "below_total" ? tidy(o.name) : tidy(o.raw)).toUpperCase();
    byRaw.set(key, [...(byRaw.get(key) ?? []), o]);
  }

  const latestMonth = occ.map((o) => (o.section === "client_row" ? o.month ?? "" : "")).sort().at(-1);
  const rows: MappingRow[] = [];
  for (const [, list] of byRaw) {
    const spellings = [...new Set(list.map((o) => tidy(o.section === "below_total" ? o.name : o.raw)))];
    const raw = spellings.join(" / ");
    const n = normalizeName(spellings[0]);
    const notes: string[] = [];
    let suggested = "";
    let kind: Kind = "client";
    let confidence: Confidence = "high";
    let reason = "";

    if (list.every((o) => o.possibleExpense)) {
      kind = "expense"; confidence = "low"; suggested = ""; reason = "looks like a purchase (ink, paper, hub…), not a client";
    } else if (!/[A-Z]{2,}/.test(n) || /^(PF|ESIC|PF CLAIM|CLAIM|REGISTRATION)$/.test(n)) {
      kind = "walk_in"; confidence = "low"; suggested = "UNNAMED WALK-IN"; reason = "no person or firm name written";
    } else if (canonical.has(n)) {
      suggested = canonical.get(n)!;
      const link = linkReason.get(n);
      if (n === suggested) reason = "client name";
      else if (compactKey(n) === compactKey(suggested)) reason = "same name after clean-up";
      else { confidence = link?.confidence ?? "medium"; reason = link?.reason ?? "grouped with similar spelling"; }
    } else if (byCompact.has(compactKey(n))) {
      suggested = byCompact.get(compactKey(n))!; reason = "same name after clean-up";
    } else {
      const near = canonicalNames.find((c) => isTypoVariant(n, c) || isGenericTailVariant(n, c));
      if (near) {
        suggested = near; confidence = "medium"; reason = "same words, small spelling difference";
      } else {
        kind = "walk_in"; confidence = "low";
        const root = walkUF.find(n);
        suggested = root;
        reason = "only seen below TOTAL (one-off work)";
        // Whole words only: "SHAMBHU KUMAR INO CONSTRUCTION" mentions INO CONSTRUCTION; "ABHISEK KUMAR" mentions nothing.
        const words = ` ${n} `;
        const mentions = canonicalNames.filter((c) => {
          const key = c.split(" ").filter((w) => w.length >= 3 && !["KUMAR", "AND", "SONS"].includes(w)).slice(0, 2).join(" ");
          return key.split(" ").length === 2 && words.includes(` ${key} `) && n !== c;
        });
        if (mentions.length) notes.push(`mentions ${mentions.join(", ")}: probably someone from that firm, kept separate`);
      }
    }

    // Look-alike regular clients that are deliberately NOT merged
    if (kind === "client" && suggested) {
      const first = suggested.split(" ")[0];
      const lookalikes = first.length >= 4 ? canonicalNames.filter((c) => c !== suggested && c.split(" ")[0] === first) : [];
      if (lookalikes.length) notes.push(`different client from ${lookalikes.join(", ")} (not merged)`);
    }

    const sheets = [...new Set(list.map((o) => o.sheet))];
    const sections = [...new Set(list.map((o) => ({ client_row: "client rows", below_total: "below TOTAL", vendor_codes: "vendor codes", list_only: "July list" })[o.section]))];
    const amountCounts = new Map<number, number>();
    for (const o of list) if (o.amountPaise !== null) amountCounts.set(o.amountPaise, (amountCounts.get(o.amountPaise) ?? 0) + 1);
    const clientRowsSorted = list.filter((o) => o.section === "client_row" && o.month).sort((a, b) => (a.month! < b.month! ? -1 : 1));
    const latestCharge = [...clientRowsSorted].reverse().find((o) => o.amountPaise && o.amountPaise > 0)?.amountPaise;
    const latestPartner = [...clientRowsSorted].reverse().find((o) => o.remark === "A" || o.remark === "R")?.remark ?? "";
    const months = list.map((o) => o.month).filter(Boolean).sort() as string[];
    if (kind === "client" && clientRowsSorted.length === 1) {
      notes.push(
        clientRowsSorted[0].month === latestMonth
          ? `new client: first appears in ${clientRowsSorted[0].sheet}`
          : `a monthly client in only one sheet (${clientRowsSorted[0].sheet}); may be one-off work`,
      );
    }

    rows.push({
      raw_name: raw,
      suggested_client: suggested,
      confidence,
      sheets_seen: sheets.join(" | "),
      kind,
      reason,
      seen_as: sections.join(", "),
      amounts_seen: [...amountCounts].sort((a, b) => b[1] - a[1]).map(([p, c]) => (c > 1 ? `${rupees(p)}×${c}` : rupees(p))).join(", "),
      latest_charge: latestCharge ? rupees(latestCharge) : "",
      latest_partner: latestPartner,
      last_seen: months.at(-1)?.slice(0, 7) ?? "",
      approve: confidence === "high" ? "yes" : "",
      use_client: "",
      notes: notes.join("; "),
    });
  }

  const order: Record<Kind, number> = { client: 0, walk_in: 1, expense: 2, ignore: 3 };
  const conf: Record<Confidence, number> = { medium: 0, low: 1, high: 2 };
  return rows.sort((a, b) =>
    order[a.kind] - order[b.kind] || a.suggested_client.localeCompare(b.suggested_client) || conf[a.confidence] - conf[b.confidence] || a.raw_name.localeCompare(b.raw_name),
  );
}

export function toCsv(rows: MappingRow[]): string {
  const cols = Object.keys(rows[0] ?? {}) as Array<keyof MappingRow>;
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(String(r[c] ?? ""))).join(","))].join("\n") + "\n";
}
