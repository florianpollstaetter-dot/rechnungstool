import { Invoice, InvoiceItem, Customer, CompanySettings } from "../types";

export type EInvoiceFormat = "none" | "zugferd" | "xrechnung";

/** ZUGFeRD conformance profiles — we target COMFORT (covers most B2B). */
export type ZugferdProfile = "minimum" | "basic" | "comfort" | "extended";

/** All data needed to produce a CII or UBL XML. */
export interface EInvoiceData {
  invoice: Invoice;
  items: InvoiceItem[];
  customer: Customer;
  settings: CompanySettings;
  leitwegId?: string;
  // ORA-3313 — supply kind for cross-border EU B2B at 0 %. "services" (default)
  // → reverse charge (category AE); "goods" → intra-community supply (category
  // K). Our data model has no goods/services marker yet, so this stays optional
  // and defaults to services; wire a per-invoice toggle to emit K.
  supply?: "goods" | "services";
}

/** Result of parsing an incoming e-invoice file. */
export interface ParsedEInvoice {
  format: "zugferd" | "xrechnung" | "unknown";
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  sellerName: string;
  sellerVatId: string;
  sellerAddress: string;
  sellerZip: string;
  sellerCity: string;
  sellerCountry: string;
  buyerName: string;
  buyerVatId: string;
  currency: string;
  lineItems: ParsedLineItem[];
  netTotal: number;
  taxRate: number;
  taxAmount: number;
  grossTotal: number;
  leitwegId?: string;
  rawXml: string;
}

export interface ParsedLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

/** DATEV Buchungsstapel row. */
export interface DatevRow {
  umsatz: string;
  sollHaben: "S" | "H";
  kontoSoll: string;
  kontoHaben: string;
  belegDatum: string;
  belegNummer: string;
  buchungstext: string;
  ustSatz: string;
}

/**
 * ORA-3314 — BMD NTCS Buchungssatz row (Austrian tax-advisor software).
 *
 * BMD imports a semicolon CSV whose first line carries the column headers; the
 * FIBU maps columns by header name (no fixed order needed). Split booking with a
 * leading personal account (Konto) and the Gegenkonto (Gkonto); the `buchcode`
 * says whether the leading account is booked Soll (1) or Haben (2). `steuercode`
 * drives BMD's automatic tax split — see at-booking-export.ts for the mapping.
 */
export interface BmdRow {
  satzart: string;      // "0" = normale FIBU-Buchung
  konto: string;        // führendes (Personen-)Konto
  gkonto: string;       // Gegenkonto
  buchsymbol: string;   // AR / ER / BK …
  belegnr: string;
  buchdatum: string;    // TT.MM.JJJJ
  belegdatum: string;   // TT.MM.JJJJ
  buchcode: string;     // 1 = Soll, 2 = Haben (für das führende Konto)
  steuercode: string;   // BMD-Steuercode, "" = keine Automatik
  betrag: string;       // Bruttobetrag des führenden Kontos, "1234,56"
  prozent: string;      // Steuerprozentsatz, "" = steuerfrei
  steuer: string;       // Steuerbetrag, "" = keiner
  text: string;         // Buchungstext
}

/**
 * ORA-3314 — RZL FIBU Buchungssatz row.
 *
 * RZL uses explicit Soll-/Habenkonto columns (no Soll/Haben flag). `ustSchluessel`
 * is the mandantenspezifische USt-Schlüssel (1 = Vorsteuer, 2 = Umsatzsteuer,
 * 0 = steuerfrei als Standard).
 */
export interface RzlRow {
  datum: string;         // TT.MM.JJJJ
  belegnummer: string;
  sollkonto: string;
  habenkonto: string;
  betrag: string;        // positiver Bruttobetrag, "1234,56"
  ustSchluessel: string; // USt-Schlüssel (mandantenspezifisch)
  text: string;          // max. 40 Zeichen
  kostenstelle: string;
}
