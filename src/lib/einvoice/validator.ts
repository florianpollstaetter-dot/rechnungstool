/**
 * EN 16931 rule-based validator (SCH-524).
 *
 * Checks the key business-term fields (BT-*) required by the EN 16931 core
 * invoice model before we hand an XML to the customer. Covers the high-risk
 * rules — missing seller/buyer identity, IBAN/UID formatting, line coherence,
 * per-rate VAT plausibility. Does NOT replace a KoSIT Schematron run, but
 * catches the mistakes a small-business user is most likely to make (empty
 * settings fields, wrong country code, bad IBAN).
 */
import { EInvoiceData } from "./types";

export interface ValidationIssue {
  code: string;
  rule: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const ISO_COUNTRY = /^[A-Z]{2}$/;
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
const UID_RE = /^[A-Z]{2}[A-Z0-9]{2,12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function validateEInvoice(data: EInvoiceData): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { invoice, customer, settings } = data;
  const lines = data.items.length > 0 ? data.items : invoice.items;

  function err(code: string, rule: string, path: string, message: string) {
    issues.push({ code, rule, path, message, severity: "error" });
  }
  function warn(code: string, rule: string, path: string, message: string) {
    issues.push({ code, rule, path, message, severity: "warning" });
  }

  // BT-1 — Invoice number.
  if (!invoice.invoice_number?.trim()) {
    err("BT-1", "BR-02", "invoice.invoice_number", "Rechnungsnummer (BT-1) fehlt.");
  }

  // BT-2 — Issue date.
  if (!DATE_RE.test(invoice.invoice_date || "")) {
    err("BT-2", "BR-03", "invoice.invoice_date", "Rechnungsdatum (BT-2) fehlt oder ungültig (erwartet: YYYY-MM-DD).");
  }

  // BT-5 — Currency.
  // (hard-coded EUR in our generator; warn only if invoice uses non-EUR anywhere in future)

  // BT-9 — Due date.
  if (!DATE_RE.test(invoice.due_date || "")) {
    err("BT-9", "BR-CO-25", "invoice.due_date", "Fälligkeitsdatum (BT-9) fehlt oder ungültig.");
  }

  // Seller (BG-4) — BT-27 name, BT-35/38/39/40 address, BT-31 UID.
  if (!settings.company_name?.trim()) {
    err("BT-27", "BR-06", "settings.company_name", "Firmenname (BT-27) fehlt in den Unternehmensdaten.");
  }
  if (!settings.address?.trim()) {
    err("BT-35", "BR-08", "settings.address", "Verkäufer-Adresse (BT-35) fehlt.");
  }
  if (!settings.city?.trim()) {
    err("BT-37", "BR-09", "settings.city", "Verkäufer-Ort (BT-37) fehlt.");
  }
  if (!settings.country?.trim()) {
    err("BT-40", "BR-09", "settings.country", "Verkäufer-Land (BT-40) fehlt.");
  } else if (!ISO_COUNTRY.test(settings.country)) {
    err("BT-40", "BR-CL-14", "settings.country", `Verkäufer-Land "${settings.country}" ist kein gültiger ISO-3166-1-Alpha-2-Code.`);
  }
  if (!settings.uid?.trim()) {
    err("BT-31", "BR-CO-9", "settings.uid", "UID-Nummer des Verkäufers (BT-31) fehlt.");
  } else if (!UID_RE.test(settings.uid.replace(/\s/g, "").toUpperCase())) {
    warn("BT-31", "BR-CO-9", "settings.uid", `UID-Nummer "${settings.uid}" hat ein ungewöhnliches Format.`);
  }

  // Buyer (BG-7) — BT-44 name, BT-50 address line, BT-55 country.
  if (!(customer.company || customer.name)?.trim()) {
    err("BT-44", "BR-07", "customer.name", "Kundenname (BT-44) fehlt.");
  }
  if (!customer.address?.trim()) {
    err("BT-50", "BR-10", "customer.address", "Kunden-Adresse (BT-50) fehlt.");
  }
  if (!customer.city?.trim()) {
    err("BT-52", "BR-11", "customer.city", "Kunden-Ort (BT-52) fehlt.");
  }
  const buyerCountry = customer.country || "";
  if (!buyerCountry) {
    warn("BT-55", "BR-11", "customer.country", "Kunden-Land (BT-55) fehlt — fällt auf 'AT' zurück.");
  } else if (!ISO_COUNTRY.test(buyerCountry)) {
    err("BT-55", "BR-CL-14", "customer.country", `Kunden-Land "${buyerCountry}" ist kein gültiger ISO-3166-1-Alpha-2-Code.`);
  }

  // BG-16 — Payment instructions (IBAN for credit transfer).
  if (!settings.iban?.trim()) {
    err("BT-84", "BR-50", "settings.iban", "IBAN (BT-84) fehlt in den Unternehmensdaten.");
  } else {
    const iban = settings.iban.replace(/\s/g, "").toUpperCase();
    if (!IBAN_RE.test(iban)) {
      err("BT-84", "BR-CL-04", "settings.iban", `IBAN "${settings.iban}" hat ein ungültiges Format.`);
    }
  }

  // BG-25 — Invoice line (at least one line, each line has quantity/price).
  if (!lines.length) {
    err("BG-25", "BR-16", "invoice.items", "Rechnung muss mindestens eine Position (BG-25) enthalten.");
  }
  lines.forEach((item, idx) => {
    const prefix = `invoice.items[${idx}]`;
    if (!item.description?.trim()) {
      err("BT-153", "BR-25", `${prefix}.description`, `Position ${idx + 1}: Artikelbezeichnung (BT-153) fehlt.`);
    }
    if (!(item.quantity > 0)) {
      err("BT-129", "BR-22", `${prefix}.quantity`, `Position ${idx + 1}: Menge (BT-129) muss größer 0 sein.`);
    }
    if (item.unit_price < 0) {
      err("BT-146", "BR-27", `${prefix}.unit_price`, `Position ${idx + 1}: Einzelpreis (BT-146) darf nicht negativ sein.`);
    }
    const rate = item.tax_rate ?? invoice.tax_rate;
    if (rate < 0 || rate > 100) {
      err("BT-152", "BR-CO-4", `${prefix}.tax_rate`, `Position ${idx + 1}: USt-Satz (BT-152) muss zwischen 0 und 100 liegen.`);
    }
  });

  // BT-112 / BT-113 — header totals plausibility.
  const computedBasis = round2(lines.reduce((s, i) => s + (i.total || 0), 0));
  const computedTax = round2(
    lines.reduce((s, i) => {
      const rate = i.tax_rate ?? invoice.tax_rate;
      return s + (i.total || 0) * (rate / 100);
    }, 0),
  );
  const headerBasis = round2(invoice.subtotal);
  const headerTax = round2(invoice.tax_amount);
  if (Math.abs(headerBasis - computedBasis) > 0.05) {
    warn(
      "BT-106",
      "BR-CO-10",
      "invoice.subtotal",
      `Netto-Summe (${headerBasis}) weicht von der Zeilensumme (${computedBasis}) um mehr als 5 Cent ab.`,
    );
  }
  if (Math.abs(headerTax - computedTax) > 0.05) {
    warn(
      "BT-110",
      "BR-CO-14",
      "invoice.tax_amount",
      `USt-Summe (${headerTax}) weicht von der berechneten Summe (${computedTax}) um mehr als 5 Cent ab.`,
    );
  }

  // BT-6 — XRechnung requires BuyerReference (Leitweg-ID) for public sector.
  if (invoice.e_invoice_format === "xrechnung") {
    const leitweg = (customer.leitweg_id || "").trim();
    if (!leitweg && buyerCountry === "DE") {
      warn(
        "BT-10",
        "BR-DE-15",
        "customer.leitweg_id",
        "XRechnung für öffentliche Auftraggeber (DE) erfordert üblicherweise eine Leitweg-ID (BT-10).",
      );
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { ok: errors.length === 0, errors, warnings };
}
