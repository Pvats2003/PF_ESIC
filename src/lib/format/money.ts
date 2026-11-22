/**
 * Money helpers. All amounts are integers in paise (₹1 = 100 paise).
 * Never use floats for money: parse strings straight to integer paise.
 */

export type Paise = number;

const inrFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inrFormatter2 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function assertPaise(value: number): asserts value is Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money must be a whole number of paise, got ${value}`);
  }
}

/** ₹1,47,555 — paise shown only when non-zero (₹1,47,555.50). */
export function formatINR(paise: Paise, opts: { symbol?: boolean; alwaysPaise?: boolean } = {}): string {
  assertPaise(paise);
  const { symbol = true, alwaysPaise = false } = opts;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const rem = abs % 100;
  const body =
    rem === 0 && !alwaysPaise
      ? inrFormatter.format(rupees)
      : `${inrFormatter.format(rupees)}.${String(rem).padStart(2, "0")}`;
  return `${negative ? "−" : ""}${symbol ? "₹" : ""}${body}`;
}

/** Compact Indian style for summary cards: ₹950, ₹45.2K, ₹1.5 L, ₹2.3 Cr. */
export function formatINRCompact(paise: Paise): string {
  assertPaise(paise);
  const negative = paise < 0;
  const rupees = Math.abs(paise) / 100;
  const trim = (n: number) => inrFormatter2.format(n).replace(/\.?0+$/, "");
  let out: string;
  if (rupees >= 1_00_00_000) out = `₹${trim(Math.floor(rupees / 1_00_000) / 100)} Cr`;
  else if (rupees >= 1_00_000) out = `₹${trim(Math.floor(rupees / 1_000) / 100)} L`;
  else if (rupees >= 1_000) out = `₹${trim(Math.floor(rupees / 100) / 10)}K`;
  else out = `₹${inrFormatter.format(Math.trunc(rupees))}`;
  return negative ? `−${out}` : out;
}

/**
 * Parse what a person types ("1,47,555", "₹ 500", "12.5", "14741.00") into paise.
 * Returns null for anything that isn't a clean non-negative amount.
 */
export function parseRupeesToPaise(input: string | number | null | undefined): Paise | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (raw === "") return null;
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(raw);
  if (!m) return null;
  const rupees = Number(m[1]);
  const paise = Number((m[2] ?? "").padEnd(2, "0"));
  const total = rupees * 100 + paise;
  return Number.isSafeInteger(total) ? total : null;
}

export function rupees(r: number): Paise {
  const p = Math.round(r * 100);
  assertPaise(p);
  return p;
}

export function sumPaise(values: ReadonlyArray<Paise | null | undefined>): Paise {
  let total = 0;
  for (const v of values) if (v) total += v;
  assertPaise(total);
  return total;
}
