/**
 * Name normalisation for matching Excel spellings to clients.
 *
 * Only spelling-level fixes happen here (case, spaces, dots, known
 * abbreviations and typos). Deciding that two different names are the same
 * client is NOT done here: see mapping.ts, which only suggests, and a person
 * approves every suggestion in data/client_mapping.csv.
 */

/** Whole-word replacements, applied after uppercasing and removing dots. */
const WORD_FIXES: Record<string, string> = {
  ENGG: "ENGINEERING",
  ENG: "ENGINEERING",
  COLLAGE: "COLLEGE",
  HOSPITA: "HOSPITAL",
  CONST: "CONSTRUCTION",
  CONTRACTION: "CONSTRUCTION",
  INDUS: "INDUSTRIES",
  INDUST: "INDUSTRIES",
  KR: "KUMAR",
  "&": "AND",
  SUNIIL: "SUNIL",
  PVT: "PRIVATE",
  LTD: "LIMITED",
};

/** Trailing service words that sometimes get typed into the name cell. */
const SERVICE_TAIL =
  /\s*[-–,]?\s*(?:(?:PF\s*(?:AND|&)?\s*ESIC|PF|ESIC)(?:\s+(?:REGISTRATION|REGUSTRATION|CLAIM|CHALLAN))?|REGISTRATION|REGUSTRATION|REGISTARTION|CLAIM|APPOINTMENT LETTER|PASSWORD)\s*$/i;

/** "1. ", "3.", "12 " list numbers typed in front of names below the TOTAL row. */
const LEADING_NUMBER = /^\s*\d{1,3}\s*[.)]?\s*(?=[A-Za-z])/;

export function cleanCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/`/g, "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Canonical spelling: "Md. Irfan Ahamad  Anssri " → "MD IRFAN AHAMAD ANSSRI", "UTTAM ENGG" → "UTTAM ENGINEERING". */
export function normalizeName(raw: string): string {
  let s = raw.toUpperCase().replace(LEADING_NUMBER, "");
  s = s.replace(/`/g, "").replace(/\./g, " ").replace(/&/g, " & ");
  s = s.replace(/[^A-Z0-9& ]+/g, " ").replace(/\s+/g, " ").trim();
  return s
    .split(" ")
    .map((w) => WORD_FIXES[w] ?? w)
    .join(" ");
}

/** Same as normalizeName but without spaces: "PankajKumar" and "PANKAJ KUMAR" share a key. */
export function compactKey(raw: string): string {
  return normalizeName(raw).replace(/ /g, "");
}

/**
 * Splits "Md Irshad Alam PF & Esic Registration" into a name and a service
 * description. Names without a service tail come back unchanged.
 */
export function splitNameAndService(raw: string): { name: string; service: string | null } {
  const noNum = raw.replace(LEADING_NUMBER, "").trim();
  const m = SERVICE_TAIL.exec(noNum);
  if (!m || m.index === 0) return { name: noNum, service: null };
  return { name: noNum.slice(0, m.index).replace(/[-–,\s]+$/, "").trim(), service: m[0].replace(/^[\s\-–,]+/, "").trim() };
}

/** Classic Levenshtein distance (small strings only). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * Same words in the same order, each word a small typo apart
 * ("IRFAN AHAMAD ANSSRI" ~ "IRFAN AHMAD ANSARI", "BHOJALA MANDAL" ~ "BHOJAL MANDAL").
 * Different word counts never match, so "RAJESH KUMAR" ≠ "RAJESH KUMAR MALAKAR".
 */
export function isTypoVariant(a: string, b: string): boolean {
  const wa = normalizeName(a).split(" ");
  const wb = normalizeName(b).split(" ");
  if (wa.length !== wb.length || wa.join(" ") === wb.join(" ")) return false;
  let changed = 0;
  for (let i = 0; i < wa.length; i++) {
    if (wa[i] === wb[i]) continue;
    const d = editDistance(wa[i], wb[i]);
    const shortest = Math.min(wa[i].length, wb[i].length);
    // At most 1 edit per short word, 2 per word of 5+ letters, and the first letter must agree.
    if (wa[i][0] !== wb[i][0] || d > (shortest >= 5 ? 2 : 1) || shortest < 4) return false;
    changed++;
  }
  return changed > 0 && changed <= 2;
}

/** "RAJ ENGINEERING" vs "RAJ ENGINEERING WORKS": one name is the other plus a generic trailing word. */
const GENERIC_TAIL_WORDS = new Set(["WORKS", "WORK", "FIRM", "CO", "COMPANY"]);
export function isGenericTailVariant(a: string, b: string): boolean {
  const [short, long] = [normalizeName(a), normalizeName(b)].sort((x, y) => x.length - y.length);
  if (!long.startsWith(`${short} `)) return false;
  const tail = long.slice(short.length + 1).split(" ");
  return tail.length === 1 && GENERIC_TAIL_WORDS.has(tail[0]);
}
