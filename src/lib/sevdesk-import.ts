// SCH-526 — sevDesk CSV/PDF import helpers.
//
// The board attached real sevDesk exports. Column names are fixed by sevDesk,
// so we match them verbatim (including German umlauts) before mapping to our
// internal product/customer shape. CSVs from sevDesk use `;` as separator and
// DE decimal commas for money; we normalise both here.

import { Product, Customer, UnitType } from "@/lib/types";

export type SevDeskKind = "products" | "customers";

export type ProductRow = Omit<Product, "id" | "created_at" | "name_translations" | "description_translations">;
export type CustomerRow = Omit<Customer, "id" | "created_at">;

export interface ImportIssue {
  row: number;
  message: string;
}

export interface ParseResult<T> {
  rows: T[];
  issues: ImportIssue[];
}

// Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes
// (""), both `,` and `;` separators, and trims surrounding whitespace. No
// dependency — the sevDesk files are small (hundreds of rows) so a hand-rolled
// parser is fine.
export function parseCsv(text: string): string[][] {
  // Strip UTF-8 BOM (sevDesk exports tend to include one).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const sep = detectSeparator(text);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === sep) { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function detectSeparator(text: string): "," | ";" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semis >= commas ? ";" : ",";
}

// sevDesk CSVs ship money as `1.234,56` (DE) OR `1234.56` (EN) OR `1,234.56`
// depending on locale settings. `30.00` and `30,00` both mean 30. Commas
// without a decimal (e.g. `1,234`) are treated as thousands separators only
// if there's also a dot.
export function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const s = raw.trim();
  if (!s) return 0;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalised: string;
  if (hasDot && hasComma) {
    // Assume the later one is decimal.
    normalised = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (hasComma) {
    normalised = s.replace(",", ".");
  } else {
    normalised = s;
  }
  const n = Number(normalised);
  return Number.isFinite(n) ? n : 0;
}

// Map sevDesk `Einheit` labels to our UnitType. sevDesk uses free text
// (Stk, Tag(e), pauschal, Stunde …); our enum is fixed. Anything unrecognised
// falls back to "Stueck" so the row still imports — user can correct later.
export function mapUnit(raw: string | undefined): UnitType {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "Stueck";
  if (s.startsWith("stk") || s.startsWith("stück") || s.startsWith("stueck")) return "Stueck";
  if (s.startsWith("std") || s.startsWith("stunde")) return "Stunden";
  if (s.startsWith("tag")) return "Tage";
  if (s.startsWith("monat")) return "Monate";
  if (s.startsWith("pausch")) return "Pauschale";
  if (s === "km") return "km";
  return "Stueck";
}

// Indexed lookup for CSV headers. sevDesk sometimes re-orders columns between
// exports, so we match by name rather than position.
function makeIndex(header: string[]): (name: string) => number {
  const lut = new Map<string, number>();
  header.forEach((h, i) => lut.set(h.trim().toLowerCase(), i));
  return (name: string) => lut.get(name.trim().toLowerCase()) ?? -1;
}

export function parseProductsCsv(text: string): ParseResult<ProductRow> {
  const grid = parseCsv(text);
  if (grid.length === 0) return { rows: [], issues: [{ row: 0, message: "Leere CSV-Datei" }] };
  const header = grid[0];
  const idx = makeIndex(header);
  const colName = idx("Name");
  const colNr = idx("Artikelnummer");
  const colUnit = idx("Einheit");
  const colVat = idx("Umsatzsteuer");
  const colPrice = idx("Verkaufspreis");
  const colDesc = idx("Beschreibung");
  if (colName < 0) {
    return { rows: [], issues: [{ row: 0, message: `Spalte "Name" nicht gefunden. Gefunden: ${header.join(", ")}` }] };
  }
  const rows: ProductRow[] = [];
  const issues: ImportIssue[] = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    const name = (r[colName] ?? "").trim();
    if (!name) { issues.push({ row: i + 1, message: "Name leer — übersprungen" }); continue; }
    rows.push({
      name,
      description: colDesc >= 0 ? (r[colDesc] ?? "").trim() : "",
      name_en: "",
      description_en: "",
      unit: mapUnit(colUnit >= 0 ? r[colUnit] : undefined),
      unit_price: colPrice >= 0 ? parseNumber(r[colPrice]) : 0,
      tax_rate: colVat >= 0 ? parseNumber(r[colVat]) : 20,
      active: true,
      role_id: null,
      external_ref: colNr >= 0 ? (r[colNr] ?? "").trim() : "",
    });
  }
  return { rows, issues };
}

export function parseCustomersCsv(text: string): ParseResult<CustomerRow> {
  const grid = parseCsv(text);
  if (grid.length === 0) return { rows: [], issues: [{ row: 0, message: "Leere CSV-Datei" }] };
  const header = grid[0];
  const idx = makeIndex(header);
  const colKdNr = idx("Kunden-Nr");
  const colOrg = idx("Organisation");
  const colFirst = idx("Vorname");
  const colLast = idx("Nachname");
  const colStreet = idx("Strasse");
  const colStreetUml = idx("Straße");
  const colZip = idx("PLZ");
  const colCity = idx("Ort");
  const colCountry = idx("Land");
  const colUid = idx("Umsatzsteuer-ID");
  const colEmail = idx("E-Mail");
  const colPhone = idx("Telefon");
  const colMobile = idx("Mobil");
  const streetCol = colStreet >= 0 ? colStreet : colStreetUml;
  const rows: CustomerRow[] = [];
  const issues: ImportIssue[] = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    const organisation = colOrg >= 0 ? (r[colOrg] ?? "").trim() : "";
    const first = colFirst >= 0 ? (r[colFirst] ?? "").trim() : "";
    const last = colLast >= 0 ? (r[colLast] ?? "").trim() : "";
    const person = [first, last].filter(Boolean).join(" ");
    if (!organisation && !person) {
      issues.push({ row: i + 1, message: "Weder Organisation noch Name — übersprungen" });
      continue;
    }
    const phone = (colMobile >= 0 ? (r[colMobile] ?? "").trim() : "")
      || (colPhone >= 0 ? (r[colPhone] ?? "").trim() : "");
    rows.push({
      name: person,
      company: organisation,
      address: streetCol >= 0 ? (r[streetCol] ?? "").trim() : "",
      zip: colZip >= 0 ? (r[colZip] ?? "").trim() : "",
      city: colCity >= 0 ? (r[colCity] ?? "").trim() : "",
      country: colCountry >= 0 ? ((r[colCountry] ?? "").trim() || "Oesterreich") : "Oesterreich",
      uid_number: colUid >= 0 ? (r[colUid] ?? "").trim() : "",
      email: colEmail >= 0 ? (r[colEmail] ?? "").trim() : "",
      phone,
      leitweg_id: "",
      external_ref: colKdNr >= 0 ? (r[colKdNr] ?? "").trim() : "",
    });
  }
  return { rows, issues };
}
