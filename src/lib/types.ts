export interface Customer {
  id: string;
  name: string;
  company: string;
  address: string;
  city: string;
  zip: string;
  country: string;
  uid_number: string;
  email: string;
  phone: string;
  created_at: string;
}

export type Language = "de" | "en";

export type UnitType = "Stueck" | "Stunden" | "Tage" | "Monate" | "Pauschale" | "km";

export const UNIT_OPTIONS: { value: UnitType; label: string; label_en: string }[] = [
  { value: "Stueck", label: "Stück", label_en: "Pieces" },
  { value: "Stunden", label: "Stunden", label_en: "Hours" },
  { value: "Tage", label: "Tage", label_en: "Days" },
  { value: "Monate", label: "Monate", label_en: "Months" },
  { value: "Pauschale", label: "Pauschale", label_en: "Flat rate" },
  { value: "km", label: "km", label_en: "km" },
];

export interface Product {
  id: string;
  name: string;
  description: string;
  name_en: string;
  description_en: string;
  unit: UnitType;
  unit_price: number;
  tax_rate: number;
  active: boolean;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  position: number;
  description: string;
  unit: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  total: number;
}

export type InvoiceStatus = "entwurf" | "offen" | "bezahlt" | "teilbezahlt" | "ueberfaellig" | "storniert";

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  project_description: string;
  invoice_date: string;
  delivery_date: string;
  due_date: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  overall_discount_percent: number;
  overall_discount_amount: number;
  status: InvoiceStatus;
  paid_at: string | null;
  paid_amount: number;
  notes: string;
  language: Language;
  accompanying_text: string | null;
  created_by: string | null;
  created_at: string;
}

export interface QuoteItem {
  id: string;
  position: number;
  description: string;
  unit: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  total: number;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export type DisplayMode = "simple" | "detailed";

export interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  project_description: string;
  quote_date: string;
  valid_until: string;
  items: QuoteItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  overall_discount_percent: number;
  overall_discount_amount: number;
  status: QuoteStatus;
  notes: string;
  language: Language;
  display_mode: DisplayMode;
  converted_invoice_id: string | null;
  created_by: string | null;
  created_at: string;
}

export type CompanyType = "gmbh" | "og" | "verein";

export const COMPANY_TYPE_OPTIONS: { value: CompanyType; label: string; description: string }[] = [
  { value: "gmbh", label: "GmbH", description: "Soll-Besteuerung (USt bei Rechnungsstellung)" },
  { value: "og", label: "OG", description: "Ist-Besteuerung (USt bei Zahlungseingang)" },
  { value: "verein", label: "Verein", description: "Eigene Regelungen" },
];

export interface CompanySettings {
  id: string;
  company_name: string;
  company_type: CompanyType;
  address: string;
  city: string;
  zip: string;
  uid: string;
  iban: string;
  bic: string;
  phone: string;
  email: string;
  logo_url: string;
  default_tax_rate: number;
  default_payment_terms_days: number;
  next_invoice_number: number;
  next_quote_number: number;
  accompanying_text_de: string;
  accompanying_text_en: string;
}

export interface Reference {
  title: string;
  description: string;
  imageUrl?: string;
}

export type MatchStatus = "unmatched" | "auto_matched" | "confirmed" | "rejected";

export interface BankStatement {
  id: string;
  file_name: string;
  upload_date: string;
  statement_date: string | null;
  bank_name: string | null;
  account_iban: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface BankTransaction {
  id: string;
  statement_id: string;
  booking_date: string | null;
  value_date: string | null;
  description: string | null;
  amount: number;
  balance_after: number | null;
  counterpart_name: string | null;
  counterpart_iban: string | null;
  reference: string | null;
  matched_invoice_id: string | null;
  match_confidence: number | null;
  match_status: MatchStatus;
  created_at: string;
  updated_at: string;
}

export type ReceiptAnalysisStatus = "pending" | "analyzing" | "done" | "error";

export type PaymentMethod = "bar" | "karte" | "ueberweisung" | "paypal" | "sonstige" | "";

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "", label: "Unbekannt" },
  { value: "bar", label: "Bar" },
  { value: "karte", label: "Karte" },
  { value: "ueberweisung", label: "Überweisung" },
  { value: "paypal", label: "PayPal" },
  { value: "sonstige", label: "Sonstige" },
];

export interface Receipt {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  invoice_date: string | null;
  purpose: string | null;
  issuer: string | null;
  amount_net: number | null;
  amount_gross: number | null;
  amount_vat: number | null;
  vat_rate: number | null;
  account_debit: string | null;
  account_credit: string | null;
  account_label: string | null;
  currency: string;
  payment_method: PaymentMethod;
  analysis_cost: number | null;
  notes: string | null;
  analysis_status: ReceiptAnalysisStatus;
  analysis_raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type UserRole = "admin" | "manager" | "accountant" | "employee";

export const USER_ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: "admin", label: "Administrator", description: "Voller Zugriff auf alle Funktionen" },
  { value: "manager", label: "Geschäftsführer", description: "Rechnungen, Angebote, Kunden, Spesen-Genehmigung" },
  { value: "accountant", label: "Buchhalter", description: "Rechnungen, Belege, Export, Spesen-Genehmigung" },
  { value: "employee", label: "Mitarbeiter", description: "Nur Spesen und Zeiterfassung" },
];

export type AppSection = "dashboard" | "invoices" | "quotes" | "customers" | "products" | "receipts" | "bank" | "export" | "fixed-costs" | "expenses" | "time" | "admin";

export const ROLE_PERMISSIONS: Record<UserRole, AppSection[]> = {
  admin: ["dashboard", "invoices", "quotes", "customers", "products", "receipts", "bank", "export", "fixed-costs", "expenses", "time", "admin"],
  manager: ["dashboard", "invoices", "quotes", "customers", "products", "receipts", "bank", "export", "fixed-costs", "expenses", "time"],
  accountant: ["dashboard", "invoices", "receipts", "bank", "export", "fixed-costs", "expenses"],
  employee: ["expenses", "time"],
};

export interface UserProfile {
  id: string;
  auth_user_id: string;
  display_name: string;
  email: string;
  role: UserRole;
  job_title: string;
  iban: string;
  address: string;
  company_access: string[];
  created_at: string;
}

export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | "booked";

export interface ExpenseReport {
  id: string;
  company_id: string;
  user_id: string;
  user_name: string;
  period_month: string;
  report_number: string;
  status: ExpenseStatus;
  total_amount: number;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string;
  created_at: string;
}

export interface ExpenseItem {
  id: string;
  expense_report_id: string;
  company_id: string;
  date: string;
  issuer: string;
  purpose: string;
  category: string;
  amount_net: number;
  vat_rate: number;
  amount_vat: number;
  amount_gross: number;
  payment_method: string;
  receipt_file_path: string | null;
  account_debit: string;
  notes: string;
  created_at: string;
}

export type TimeEntryType = "work" | "pause";

// Weekday encoding used across scheduling: 0 = Monday … 6 = Sunday (ISO-style),
// matching the Mo Di Mi Do Fr Sa So header order used in the analytics UI.
export const WEEKDAY_LABELS: readonly string[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const WEEKDAY_LABELS_LONG: readonly string[] = [
  "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag",
];

export interface UserWorkSchedule {
  id: string;
  user_id: string;
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  daily_target_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  company_id: string;
  user_id: string;
  user_name: string;
  quote_id: string | null;
  project_label: string;
  // SCH-366 Modul 4: structured Projekt/Task-FKs. Optional, damit die
  // bestehenden Timer/Manual-UIs weiter ohne project_id/task_id arbeiten,
  // bis die Projekt/Aufgaben-UI live ist. DB-Spalten sind nullable.
  project_id?: string | null;
  task_id?: string | null;
  description: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number;
  billable: boolean;
  hourly_rate: number;
  entry_type: TimeEntryType;
  created_at: string;
}

// SCH-366 Modul 4 — Projekte & Aufgaben (neue Strukturebenen).

export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "paused", label: "Pausiert" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "archived", label: "Archiviert" },
];

export interface Project {
  id: string;
  company_id: string;
  name: string;
  color: string | null;
  status: ProjectStatus;
  quote_id: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Arbeit" },
  { value: "done", label: "Erledigt" },
  { value: "cancelled", label: "Abgebrochen" },
];

export interface Task {
  id: string;
  company_id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee_user_id: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

// SCH-366 Modul 1 — Dashboard-Layout-Persistenz pro User. Das layout_json
// enthält das react-grid-layout-Objekt opak; die UI ist die einzige
// Schreib-/Leseinstanz. dashboard_key erlaubt mehrere benannte Dashboards
// pro User (Default "main").
export interface UserDashboardLayout {
  id: string;
  company_id: string;
  user_id: string;
  dashboard_key: string;
  layout_json: unknown;
  created_at: string;
  updated_at: string;
}

export type FixedCostInterval = "monthly" | "quarterly" | "yearly";

export const FIXED_COST_INTERVAL_OPTIONS: { value: FixedCostInterval; label: string }[] = [
  { value: "monthly", label: "Monatlich" },
  { value: "quarterly", label: "Vierteljährlich" },
  { value: "yearly", label: "Jährlich" },
];

export const FIXED_COST_CATEGORIES: { value: string; label: string }[] = [
  { value: "rent", label: "Miete" },
  { value: "insurance", label: "Versicherung" },
  { value: "subscription", label: "Abonnement" },
  { value: "salary", label: "Gehalt" },
  { value: "telecom", label: "Telekommunikation" },
  { value: "software", label: "Software" },
  { value: "other", label: "Sonstiges" },
];

export type TemplateType = "invoice" | "quote";

export interface TemplateItem {
  position: number;
  description: string;
  unit: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
}

export interface Template {
  id: string;
  name: string;
  template_type: TemplateType;
  customer_id: string | null;
  project_description: string;
  items: TemplateItem[];
  tax_rate: number;
  overall_discount_percent: number;
  overall_discount_amount: number;
  notes: string;
  language: Language;
  created_at: string;
}

export interface FixedCost {
  id: string;
  name: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  vat_rate: number;
  interval: FixedCostInterval;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  account_number: string;
  account_label: string;
  supplier: string;
  notes: string;
  created_at: string;
  updated_at: string;
}
