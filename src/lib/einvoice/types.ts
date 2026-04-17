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
