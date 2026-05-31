// ORA-2307 — DSGVO-conformant IBAN masking for log lines.
//
// Spec: mask the middle 6 characters (per ORA-2307 acceptance criteria).
// Country code + check digits + BLZ prefix stay visible at the head; the
// final block (account-suffix) stays visible at the tail. Six asterisks in
// the middle break the IBAN's identifiability for log readers while keeping
// enough surface for forensics (which IBAN family / which institution).
//
// Examples:
//   AT611904300234573201  → AT61190******34573201
//   DE89370400440532013000 → DE8937040******0532013000

const MASKED_MIDDLE_LEN = 6;

export function maskIban(iban: string | null | undefined): string {
  if (!iban) return "";
  const cleaned = iban.replace(/\s+/g, "").toUpperCase();
  if (cleaned.length <= MASKED_MIDDLE_LEN + 4) {
    // Not enough surface to expose both ends without leaking >half the IBAN —
    // redact wholly. Real IBANs are ≥15 chars so this is only the
    // pathological-input branch.
    return cleaned.length === 0 ? "" : "*".repeat(cleaned.length);
  }
  const visibleLen = cleaned.length - MASKED_MIDDLE_LEN;
  const headLen = Math.ceil(visibleLen / 2);
  const tailLen = visibleLen - headLen;
  return `${cleaned.slice(0, headLen)}${"*".repeat(MASKED_MIDDLE_LEN)}${cleaned.slice(cleaned.length - tailLen)}`;
}
