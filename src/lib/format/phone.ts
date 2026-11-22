/**
 * Normalise Indian mobile numbers to E.164 (+91XXXXXXXXXX).
 * Accepts 10 digits, +91 / 91 prefix, a leading 0, spaces, dashes and brackets.
 * Returns null when the input is not a valid Indian mobile number.
 */
export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

/** +919430449312 → "94304 49312" for display. */
export function formatIndianPhone(e164: string): string {
  const d = e164.replace(/^\+91/, "");
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : e164;
}

/** wa.me wants digits only, with country code. */
export function waMeNumber(e164: string): string {
  return e164.replace(/\D/g, "");
}
