/**
 * Amount in words, Indian numbering (thousand, lakh, crore).
 *
 * English: "One Lakh Forty-Seven Thousand Five Hundred Fifty-Five Rupees Only"
 * Hindi:   "एक लाख सैंतालीस हज़ार पाँच सौ पचपन रुपये मात्र"
 *
 * Hindi number words for 1–99 are irregular (47 = सैंतालीस, not "चालीस सात"),
 * so they come from a complete lookup table, never built from parts.
 */

const EN_ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const EN_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function en99(n: number): string {
  if (n < 20) return EN_ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? EN_TENS[t] : `${EN_TENS[t]}-${EN_ONES[o]}`;
}

/** Index = number. HI_0_99[47] === "सैंतालीस". Every entry is written out. */
export const HI_0_99: readonly string[] = [
  "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ",
  "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस",
  "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस",
  "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस",
  "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चौवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास",
  "पचास", "इक्यावन", "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ",
  "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर",
  "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
  "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी",
  "नब्बे", "इक्यानबे", "बानबे", "तिरानबे", "चौरानबे", "पचानबे", "छियानबे", "सत्तानबे", "अट्ठानबे", "निन्यानबे",
];

type Lang = "en" | "hi";

const UNITS: Record<Lang, { crore: string; lakh: string; thousand: string; hundred: string }> = {
  en: { crore: "Crore", lakh: "Lakh", thousand: "Thousand", hundred: "Hundred" },
  hi: { crore: "करोड़", lakh: "लाख", thousand: "हज़ार", hundred: "सौ" },
};

/** Whole number → words in the Indian system. 0 → "Zero"/"शून्य". */
export function numberToWords(n: number, lang: Lang): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`Expected a non-negative integer, got ${n}`);
  const w = (k: number) => (lang === "hi" ? HI_0_99[k] : en99(k));
  if (n === 0) return w(0);
  const u = UNITS[lang];
  const out: string[] = [];

  const crore = Math.floor(n / 1_00_00_000);
  let rest = n % 1_00_00_000;
  if (crore > 0) out.push(crore > 99 ? numberToWords(crore, lang) : w(crore), u.crore);
  const lakh = Math.floor(rest / 1_00_000);
  rest %= 1_00_000;
  if (lakh > 0) out.push(w(lakh), u.lakh);
  const thousand = Math.floor(rest / 1_000);
  rest %= 1_000;
  if (thousand > 0) out.push(w(thousand), u.thousand);
  const hundred = Math.floor(rest / 100);
  rest %= 100;
  if (hundred > 0) out.push(w(hundred), u.hundred);
  if (rest > 0) out.push(w(rest));
  return out.join(" ");
}

/** Paise → "… Rupees Only" / "… रुपये मात्र" (with paise when present). */
export function amountInWords(paise: number, lang: Lang): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new RangeError(`Expected non-negative paise, got ${paise}`);
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  if (lang === "hi") {
    const rs = `${numberToWords(r, "hi")} रुपये`;
    return p ? `${rs} और ${numberToWords(p, "hi")} पैसे मात्र` : `${rs} मात्र`;
  }
  const rs = `${numberToWords(r, "en")} ${r === 1 ? "Rupee" : "Rupees"}`;
  return p ? `${rs} and ${numberToWords(p, "en")} Paise Only` : `${rs} Only`;
}
