/**
 * ORA-3314 — BMD (NTCS) and RZL booking-export for Austrian tax-advisor software.
 *
 * Sibling of datev-export.ts: pure transformation functions that turn our
 * invoices and receipts into BMD / RZL booking rows, plus CSV serializers. No
 * DB, no I/O — unit-testable in isolation.
 *
 * Both target the common "vorbereitende Buchhaltung" workflow: the client exports
 * a monthly booking file, the Steuerberater imports it into BMD NTCS or RZL and
 * posts it. Because account numbers and tax codes are *mandantenspezifisch* (set
 * per client in the accounting software), the defaults below are the documented
 * BMD/RZL standard values and the sammel-accounts of the Austrian EKR
 * (Einheitskontenrahmen). The Steuerberater remaps them on import — that is the
 * normal BMD/RZL import step. The structure, dates, amounts, Soll/Haben direction
 * and the category → tax-code mapping are what this module gets right.
 *
 * Tax codes (ORA-3311 Punkt 2 categories E/AE/K/S/Z, see tax-category.ts):
 *
 *   Kategorie │ BMD Steuercode (Ausgang) │ RZL USt-Schlüssel (Ausgang)
 *   ──────────┼──────────────────────────┼────────────────────────────
 *   S  Normal │ 1  (Umsatzsteuer)         │ 2  (Umsatzsteuer)
 *   Z  0 %    │ "" (keine Automatik)      │ 0
 *   E  KleinU │ "" (steuerfrei)           │ 0
 *   AE Rev-Ch │ 77 (Reverse Charge Ausg.) │ 0  (mandantenspezifisch)
 *   K  ig.Lfg │ 7  (ig. Lieferung)        │ 0  (mandantenspezifisch)
 *
 * The rate (20/10) rides in the `prozent` field / the amounts, not in the code —
 * BMD code 1 covers every positive domestic rate, the Prozent field disambiguates.
 * For input (Eingangsrechnungen) with Vorsteuer: BMD code 2, RZL Schlüssel 1.
 *
 * Sources: BMD NTCS FIBU04 Schnittstelle (EDV Hausleitner, 2020); RZL FIBU
 * Import-Schnittstelle; domonda Steuercode-Referenz. Documented in ORA-3314.
 */
import { Invoice, Customer, Receipt, CompanySettings, Language } from "../types";
import { BmdRow, RzlRow } from "./types";
import {
  deriveTaxCategory,
  TaxCategoryContext,
  TaxCategoryCode,
} from "./tax-category";

const BOM = "﻿";

/**
 * Austrian EKR Sammelkonten (defaults; remapped per Mandant on import).
 * Kept deliberately simple — one receivables/payables/revenue/expense collective
 * account each, mirroring the single-account approach of datev-export.ts.
 */
const DEBITOR_SAMMELKONTO = "2000"; // Forderungen aus Lieferungen & Leistungen
const KREDITOR_SAMMELKONTO = "3300"; // Verbindlichkeiten aus L&L
const ERLOES_KONTO = "4000"; // Erlöse (steuerpflichtig, Satz via Prozent)
const ERLOES_STEUERFREI = "4100"; // Steuerfreie/0 % Erlöse (Z/E/AE/K)
const BANK_KONTO = "2800"; // Bank
const AUFWAND_DEFAULT = "7600"; // Sonstiger Aufwand

/** Format an ISO date as TT.MM.JJJJ (BMD/RZL expect the Austrian date format). */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** German decimal, comma separator, two places, always positive. */
function fmtAmount(n: number): string {
  return Math.abs(n).toFixed(2).replace(".", ",");
}

/** Integer percentage (no decimals for whole rates, comma for e.g. 13,5). */
function fmtPercent(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}

/** Company settings subset the derivation needs. */
export type BookingExportSettings = Pick<
  CompanySettings,
  "country" | "is_kleinunternehmer"
>;

/** Build the tax-category context for one invoice. */
function categoryFor(
  inv: Invoice,
  customer: Customer | undefined,
  settings: BookingExportSettings
): TaxCategoryCode {
  const ctx: TaxCategoryContext = {
    sellerCountry: (settings.country || "AT").trim().toUpperCase(),
    isKleinunternehmer: settings.is_kleinunternehmer === true,
    buyerCountry: (customer?.country || "AT").trim().toUpperCase(),
    buyerUid: (customer?.uid_number || "").trim(),
    lang: (inv.language || "de") as Language,
    // Our data model carries no goods/services marker; cross-border 0 % therefore
    // defaults to reverse charge (AE), never intra-community goods (K). Same
    // assumption as the e-invoice generators (ORA-3313).
    supply: "services",
  };
  return deriveTaxCategory(inv.tax_rate, ctx).code;
}

/** Category → BMD Steuercode for outgoing invoices (Umsatzsteuer side). */
function bmdSteuercodeOutput(cat: TaxCategoryCode): string {
  switch (cat) {
    case "S":
      return "1"; // Umsatzsteuer (Rate rides in prozent)
    case "AE":
      return "77"; // Reverse Charge Ausgang (Übergang der Steuerschuld)
    case "K":
      return "7"; // innergemeinschaftliche Lieferung
    case "Z":
    case "E":
    default:
      return ""; // steuerfrei / keine Automatik
  }
}

/** Category → RZL USt-Schlüssel for outgoing invoices. */
function rzlSchluesselOutput(cat: TaxCategoryCode): string {
  // RZL ships 1 = Vorsteuer, 2 = Umsatzsteuer as standard; the 0 %-regimes
  // (reverse charge / ig. Lieferung) use mandantenspezifische Schlüssel, so we
  // emit 0 (steuerfrei) and let the Steuerberater assign the right key.
  return cat === "S" ? "2" : "0";
}

// --- BMD ------------------------------------------------------------------

/** Generate BMD booking rows from outgoing invoices. */
export function invoicesToBmdRows(
  invoices: Invoice[],
  customers: Map<string, Customer>,
  settings: BookingExportSettings
): BmdRow[] {
  const rows: BmdRow[] = [];

  for (const inv of invoices) {
    if (inv.status === "entwurf") continue;

    const customer = customers.get(inv.customer_id);
    const customerName = customer
      ? customer.company || customer.name
      : "Unbekannt";
    const cat = categoryFor(inv, customer, settings);
    const taxable = cat === "S";

    // Invoice booking: leading account = Debitor (Soll, Buchcode 1),
    // Gegenkonto = Erlöskonto.
    rows.push({
      satzart: "0",
      konto: DEBITOR_SAMMELKONTO,
      gkonto: taxable ? ERLOES_KONTO : ERLOES_STEUERFREI,
      buchsymbol: "AR",
      belegnr: inv.invoice_number,
      buchdatum: fmtDate(inv.invoice_date),
      belegdatum: fmtDate(inv.invoice_date),
      buchcode: "1",
      steuercode: bmdSteuercodeOutput(cat),
      betrag: fmtAmount(inv.total),
      prozent: taxable ? fmtPercent(inv.tax_rate) : "",
      steuer: taxable ? fmtAmount(inv.tax_amount) : "",
      text: `RE ${inv.invoice_number} ${customerName}`.slice(0, 60),
    });

    // Payment: Bank (Soll) against Debitor.
    if (inv.status === "bezahlt" && inv.paid_at) {
      rows.push({
        satzart: "0",
        konto: BANK_KONTO,
        gkonto: DEBITOR_SAMMELKONTO,
        buchsymbol: "BK",
        belegnr: inv.invoice_number,
        buchdatum: fmtDate(inv.paid_at),
        belegdatum: fmtDate(inv.paid_at),
        buchcode: "1",
        steuercode: "",
        betrag: fmtAmount(inv.total),
        prozent: "",
        steuer: "",
        text: `Zahlung RE ${inv.invoice_number}`.slice(0, 60),
      });
    }
  }

  return rows;
}

/** Generate BMD booking rows from receipts (Eingangsrechnungen, Vorsteuer). */
export function receiptsToBmdRows(receipts: Receipt[]): BmdRow[] {
  const rows: BmdRow[] = [];

  for (const r of receipts) {
    if (!r.amount_gross || !r.invoice_date) continue;

    const vatRate = r.vat_rate ?? 20;
    const taxable = vatRate > 0;

    // Leading account = Kreditor (Haben, Buchcode 2), Gegenkonto = Aufwand.
    rows.push({
      satzart: "0",
      konto: KREDITOR_SAMMELKONTO,
      gkonto: r.account_debit || AUFWAND_DEFAULT,
      buchsymbol: "ER",
      belegnr: r.file_name.replace(/\.[^.]+$/, "").slice(0, 20),
      buchdatum: fmtDate(r.invoice_date),
      belegdatum: fmtDate(r.invoice_date),
      buchcode: "2",
      steuercode: taxable ? "2" : "", // 2 = Vorsteuer
      betrag: fmtAmount(r.amount_gross),
      prozent: taxable ? fmtPercent(vatRate) : "",
      steuer: r.amount_vat != null ? fmtAmount(r.amount_vat) : "",
      text: `${r.issuer || "Beleg"} ${r.purpose || ""}`.trim().slice(0, 60),
    });
  }

  return rows;
}

/** Serialize BMD rows to a semicolon CSV with a header line (UTF-8 + BOM). */
export function bmdRowsToCsv(rows: BmdRow[]): string {
  const header = [
    "Satzart",
    "Konto",
    "Gkonto",
    "Buchsymbol",
    "Belegnr",
    "Buchdatum",
    "Belegdatum",
    "Buchcode",
    "Steuercode",
    "Betrag",
    "Prozent",
    "Steuer",
    "Text",
  ].join(";");

  const lines = rows.map((r) =>
    [
      r.satzart,
      r.konto,
      r.gkonto,
      r.buchsymbol,
      r.belegnr,
      r.buchdatum,
      r.belegdatum,
      r.buchcode,
      r.steuercode,
      r.betrag,
      r.prozent,
      r.steuer,
      `"${r.text.replace(/"/g, "'")}"`,
    ].join(";")
  );

  return BOM + header + "\r\n" + lines.join("\r\n") + "\r\n";
}

// --- RZL -------------------------------------------------------------------

/** Generate RZL booking rows from outgoing invoices. */
export function invoicesToRzlRows(
  invoices: Invoice[],
  customers: Map<string, Customer>,
  settings: BookingExportSettings
): RzlRow[] {
  const rows: RzlRow[] = [];

  for (const inv of invoices) {
    if (inv.status === "entwurf") continue;

    const customer = customers.get(inv.customer_id);
    const customerName = customer
      ? customer.company || customer.name
      : "Unbekannt";
    const cat = categoryFor(inv, customer, settings);
    const taxable = cat === "S";

    // Forderung (Soll) an Erlös (Haben).
    rows.push({
      datum: fmtDate(inv.invoice_date),
      belegnummer: inv.invoice_number,
      sollkonto: DEBITOR_SAMMELKONTO,
      habenkonto: taxable ? ERLOES_KONTO : ERLOES_STEUERFREI,
      betrag: fmtAmount(inv.total),
      ustSchluessel: rzlSchluesselOutput(cat),
      text: `RE ${inv.invoice_number} ${customerName}`.slice(0, 40),
      kostenstelle: "",
    });

    // Bank (Soll) an Forderung (Haben).
    if (inv.status === "bezahlt" && inv.paid_at) {
      rows.push({
        datum: fmtDate(inv.paid_at),
        belegnummer: inv.invoice_number,
        sollkonto: BANK_KONTO,
        habenkonto: DEBITOR_SAMMELKONTO,
        betrag: fmtAmount(inv.total),
        ustSchluessel: "0",
        text: `Zahlung RE ${inv.invoice_number}`.slice(0, 40),
        kostenstelle: "",
      });
    }
  }

  return rows;
}

/** Generate RZL booking rows from receipts (Eingangsrechnungen, Vorsteuer). */
export function receiptsToRzlRows(receipts: Receipt[]): RzlRow[] {
  const rows: RzlRow[] = [];

  for (const r of receipts) {
    if (!r.amount_gross || !r.invoice_date) continue;

    const vatRate = r.vat_rate ?? 20;

    // Aufwand (Soll) an Verbindlichkeit (Haben).
    rows.push({
      datum: fmtDate(r.invoice_date),
      belegnummer: r.file_name.replace(/\.[^.]+$/, "").slice(0, 20),
      sollkonto: r.account_debit || AUFWAND_DEFAULT,
      habenkonto: KREDITOR_SAMMELKONTO,
      betrag: fmtAmount(r.amount_gross),
      ustSchluessel: vatRate > 0 ? "1" : "0", // 1 = Vorsteuer
      text: `${r.issuer || "Beleg"} ${r.purpose || ""}`.trim().slice(0, 40),
      kostenstelle: "",
    });
  }

  return rows;
}

/**
 * Serialize RZL rows to a semicolon CSV with a header line.
 *
 * Returns a plain string; use {@link encodeCp1252} at the download layer because
 * RZL expects ANSI (Windows-1252), not UTF-8 — otherwise Umlaute/€ break on
 * import. Field separator must not occur inside the text (we never emit one in a
 * generated text), so RZL rows are not quoted.
 */
export function rzlRowsToCsv(rows: RzlRow[]): string {
  const header = [
    "Datum",
    "Belegnummer",
    "Sollkonto",
    "Habenkonto",
    "Betrag",
    "USt-Schluessel",
    "Text",
    "Kostenstelle",
  ].join(";");

  const lines = rows.map((r) =>
    [
      r.datum,
      r.belegnummer,
      r.sollkonto,
      r.habenkonto,
      r.betrag,
      r.ustSchluessel,
      // Strip the separator and line breaks defensively; RZL has no quoting.
      r.text.replace(/[;\r\n]/g, " "),
      r.kostenstelle,
    ].join(";")
  );

  return header + "\r\n" + lines.join("\r\n") + "\r\n";
}

/**
 * Encode a string to Windows-1252 (CP1252) bytes for RZL downloads.
 *
 * Covers ASCII, the Latin-1 supplement (0xA0–0xFF, includes äöüÄÖÜß) and the
 * CP1252-specific 0x80–0x9F block (notably € = 0x80). Anything outside falls back
 * to "?" — acceptable for Austrian booking data, which stays within Latin-1 + €.
 */
export function encodeCp1252(s: string): Uint8Array<ArrayBuffer> {
  // Reverse map for the CP1252 0x80–0x9F printable code points.
  const high: Record<number, number> = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f,
  };
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i);
    if (cp <= 0xff) {
      out[i] = cp; // ASCII + Latin-1 map 1:1
    } else if (high[cp] !== undefined) {
      out[i] = high[cp];
    } else {
      out[i] = 0x3f; // "?"
    }
  }
  return out;
}
