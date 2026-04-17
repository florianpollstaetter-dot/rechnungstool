/**
 * DATEV Buchungsstapel CSV export.
 * Format: DATEV-kompatibel for import into DATEV Rechnungswesen.
 */
import { Invoice, Customer, Receipt } from "../types";
import { DatevRow } from "./types";

const BOM = "\uFEFF";

/** Standard account mapping for Austrian SKR07 / German SKR03. */
const REVENUE_ACCOUNT = "8400"; // Erlöse 20% USt
const REVENUE_ACCOUNT_0 = "8000"; // Steuerfreie Erlöse
const RECEIVABLES_ACCOUNT = "1400"; // Forderungen aus Lieferungen
const PAYABLES_ACCOUNT = "1600"; // Verbindlichkeiten
const EXPENSE_ACCOUNT_DEFAULT = "6300"; // Sonstiger Aufwand
const BANK_ACCOUNT = "1200"; // Bank

function fmtDatev(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}`;
}

function fmtAmount(n: number): string {
  return Math.abs(n).toFixed(2).replace(".", ",");
}

/**
 * Generate DATEV Buchungsstapel rows from invoices.
 */
export function invoicesToDatevRows(
  invoices: Invoice[],
  customers: Map<string, Customer>
): DatevRow[] {
  const rows: DatevRow[] = [];

  for (const inv of invoices) {
    if (inv.status === "entwurf") continue;

    const customer = customers.get(inv.customer_id);
    const customerName = customer
      ? customer.company || customer.name
      : "Unbekannt";

    const revenueAccount = inv.tax_rate > 0 ? REVENUE_ACCOUNT : REVENUE_ACCOUNT_0;

    // Booking: Debit receivables, Credit revenue
    rows.push({
      umsatz: fmtAmount(inv.total),
      sollHaben: "S",
      kontoSoll: RECEIVABLES_ACCOUNT,
      kontoHaben: revenueAccount,
      belegDatum: fmtDatev(inv.invoice_date),
      belegNummer: inv.invoice_number,
      buchungstext: `RE ${inv.invoice_number} ${customerName}`.slice(0, 60),
      ustSatz: inv.tax_rate > 0 ? fmtAmount(inv.tax_rate) : "",
    });

    // If paid, book bank receipt
    if (inv.status === "bezahlt" && inv.paid_at) {
      rows.push({
        umsatz: fmtAmount(inv.total),
        sollHaben: "S",
        kontoSoll: BANK_ACCOUNT,
        kontoHaben: RECEIVABLES_ACCOUNT,
        belegDatum: fmtDatev(inv.paid_at),
        belegNummer: inv.invoice_number,
        buchungstext: `Zahlung RE ${inv.invoice_number}`.slice(0, 60),
        ustSatz: "",
      });
    }
  }

  return rows;
}

/**
 * Generate DATEV rows from receipts (Eingangsrechnungen).
 */
export function receiptsToDatevRows(receipts: Receipt[]): DatevRow[] {
  const rows: DatevRow[] = [];

  for (const r of receipts) {
    if (!r.amount_gross || !r.invoice_date) continue;

    const account = r.account_debit || EXPENSE_ACCOUNT_DEFAULT;
    const vatRate = r.vat_rate ?? 20;

    rows.push({
      umsatz: fmtAmount(r.amount_gross),
      sollHaben: "S",
      kontoSoll: account,
      kontoHaben: PAYABLES_ACCOUNT,
      belegDatum: fmtDatev(r.invoice_date),
      belegNummer: r.file_name.replace(/\.[^.]+$/, "").slice(0, 12),
      buchungstext: `${r.issuer || "Beleg"} ${r.purpose || ""}`.trim().slice(0, 60),
      ustSatz: vatRate > 0 ? fmtAmount(vatRate) : "",
    });
  }

  return rows;
}

/**
 * Convert DatevRows to a DATEV-compatible CSV string.
 * Uses semicolon separator and German number format (comma decimal).
 */
export function datevRowsToCsv(rows: DatevRow[]): string {
  const header = [
    "Umsatz (ohne Soll/Haben-Kz)",
    "Soll/Haben-Kennzeichen",
    "Konto",
    "Gegenkonto (ohne BU-Schlüssel)",
    "Belegdatum",
    "Belegfeld 1",
    "Buchungstext",
    "UStSatz",
  ].join(";");

  const lines = rows.map((r) =>
    [
      r.umsatz,
      r.sollHaben,
      r.kontoSoll,
      r.kontoHaben,
      r.belegDatum,
      r.belegNummer,
      `"${r.buchungstext}"`,
      r.ustSatz,
    ].join(";")
  );

  return BOM + header + "\n" + lines.join("\n") + "\n";
}
