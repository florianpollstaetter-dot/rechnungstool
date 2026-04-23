// SCH-580 — derived EN 16931 readiness check for a customer row.
//
// Mirrors the seller-side validator (src/lib/einvoice/validator.ts) for the
// buyer (BG-7) subset: BT-44 name, BT-50 address, BT-52 city, BT-55 country
// (ISO-3166-1-Alpha-2), and BT-48 UID when provided. Used by the customer
// list to show a green check / red X badge, and by the detail page to list
// what's missing so the user knows what to fill in.

import { Customer } from "@/lib/types";

const ISO_COUNTRY = /^[A-Z]{2}$/;
const UID_RE = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

export interface CustomerReadiness {
  ready: boolean;
  missing: string[]; // human-readable labels, German
}

// Common free-text country names in AT/DE → ISO-2. Lets the user enter
// "Oesterreich" in the free-text country field and still pass the check.
const COUNTRY_ALIASES: Record<string, string> = {
  oesterreich: "AT",
  österreich: "AT",
  austria: "AT",
  deutschland: "DE",
  germany: "DE",
  schweiz: "CH",
  switzerland: "CH",
  italien: "IT",
  italy: "IT",
};

function normalizeCountry(c: string): string {
  const t = (c || "").trim();
  if (!t) return "";
  if (ISO_COUNTRY.test(t.toUpperCase())) return t.toUpperCase();
  const alias = COUNTRY_ALIASES[t.toLowerCase()];
  return alias ?? "";
}

export function customerEInvoiceReadiness(c: Customer): CustomerReadiness {
  const missing: string[] = [];

  if (!(c.company || c.name)?.trim()) {
    missing.push("Name oder Firma");
  }
  if (!c.address?.trim()) missing.push("Adresse");
  if (!c.zip?.trim()) missing.push("PLZ");
  if (!c.city?.trim()) missing.push("Ort");
  if (!normalizeCountry(c.country)) {
    missing.push("Land (ISO-Code)");
  }
  if (c.uid_number && !UID_RE.test(c.uid_number.replace(/\s/g, "").toUpperCase())) {
    missing.push("UID-Format ungültig");
  }

  return { ready: missing.length === 0, missing };
}
