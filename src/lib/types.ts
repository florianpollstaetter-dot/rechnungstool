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
  leitweg_id: string;
  // SCH-526 — sevDesk `Kunden-Nr` preserved when imported. Empty string
  // for hand-entered rows. Unique within a company when non-empty.
  external_ref?: string;
  created_at: string;
}

export type Language = "de" | "en";

// SCH-447 — Extended locale set for user-content translations. Mirrors AppLocale
// in i18n-context.tsx. PDF documents still store `de` or `en` in `language`; this
// type is used for content-translation JSONB keys (products.name_translations,
// company_settings.accompanying_text_translations, user_profiles.accompanying_text_translations).
export type ContentLocale = "de" | "en" | "fr" | "es" | "it" | "tr" | "pl" | "ar";

export type TranslationMap = Partial<Record<ContentLocale, string>>;

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
  // SCH-447 — per-locale overrides for the 6 additional UI languages (fr, es, it, tr, pl, ar).
  // DE/EN keys are also mirrored here so consumers can resolve any locale uniformly.
  // Optional on input; `mapProduct` always returns populated objects from the DB.
  name_translations?: TranslationMap;
  description_translations?: TranslationMap;
  unit: UnitType;
  unit_price: number;
  tax_rate: number;
  active: boolean;
  role_id?: string | null;
  // SCH-526 — sevDesk `Artikelnummer` preserved when imported.
  external_ref?: string;
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
  // SCH-524 — per-line VAT rate. Falls back to invoice header tax_rate when
  // omitted (legacy single-rate invoices). Required for EN 16931 mixed-rate
  // invoices.
  tax_rate?: number;
  total: number;
}

export type InvoiceStatus = "entwurf" | "offen" | "bezahlt" | "teilbezahlt" | "ueberfaellig" | "storniert";

export type EInvoiceFormat = "none" | "zugferd" | "xrechnung";

export const E_INVOICE_FORMAT_OPTIONS: { value: EInvoiceFormat; label: string; description: string }[] = [
  { value: "none", label: "Standard PDF", description: "Klassische PDF-Rechnung ohne E-Rechnung" },
  { value: "zugferd", label: "ZUGFeRD", description: "PDF mit eingebettetem XML (Hybrid) — empfohlen für B2B" },
  { value: "xrechnung", label: "XRechnung", description: "Reines XML-Format — für öffentliche Auftraggeber (B2G)" },
];

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
  e_invoice_format: EInvoiceFormat;
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
  tax_rate?: number;
  total: number;
  role_id?: string | null;
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

export type CompanyType =
  | "gmbh"
  | "ag"
  | "kg"
  | "gmbh_co_kg"
  | "og"
  | "eu"
  | "ez"
  | "verein";

export const COMPANY_TYPE_OPTIONS: { value: CompanyType; label: string; description: string }[] = [
  { value: "gmbh", label: "GmbH", description: "Gesellschaft mit beschränkter Haftung" },
  { value: "ag", label: "AG", description: "Aktiengesellschaft" },
  { value: "kg", label: "KG", description: "Kommanditgesellschaft" },
  { value: "gmbh_co_kg", label: "GmbH & Co. KG", description: "KG mit GmbH als Komplementär" },
  { value: "og", label: "OG", description: "Offene Gesellschaft" },
  { value: "eu", label: "e.U.", description: "Eingetragener Unternehmer (Firmenbuch)" },
  { value: "ez", label: "EZ", description: "Einzelunternehmer (nicht eingetragen)" },
  { value: "verein", label: "Verein", description: "Eigene Regelungen" },
];

// Forms that are registered in the Firmenbuch and therefore require Firmenbuchnummer/gericht on invoices.
export const FIRMENBUCH_REGISTERED_TYPES: CompanyType[] = [
  "gmbh",
  "ag",
  "kg",
  "gmbh_co_kg",
  "og",
  "eu",
];

export function isFirmenbuchRegistered(type: CompanyType): boolean {
  return FIRMENBUCH_REGISTERED_TYPES.includes(type);
}

export interface CompanySettings {
  id: string;
  company_name: string;
  company_type: CompanyType;
  address: string;
  city: string;
  zip: string;
  country: string;
  uid: string;
  firmenbuchnummer: string;
  firmenbuchgericht: string;
  firmenbuchnummer_komplementaer: string;
  firmenbuchgericht_komplementaer: string;
  is_kleinunternehmer: boolean;
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
  // SCH-447 — per-locale overrides for 8 UI languages. Falls back to de/en columns.
  // Optional on input; mappers return populated objects from the DB.
  accompanying_text_translations?: TranslationMap;
  industry: string;
  website: string;
  description: string;
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

export type GreetingTone = "motivating" | "challenging" | "sarcastic" | "off";

export const GREETING_TONES: GreetingTone[] = ["motivating", "challenging", "sarcastic", "off"];

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
  accompanying_text_de: string;
  accompanying_text_en: string;
  // SCH-447 — per-locale overrides for 8 UI languages.
  // Optional on input; mapper returns populated objects from the DB.
  accompanying_text_translations?: TranslationMap;
  // SCH-518 — navbar greeting tone; "off" hides the greeting.
  greeting_tone: GreetingTone;
  // SCH-582 — first-login onboarding tour completion marker.
  // NULL on fresh profiles; set to NOW() when the tour is finished or skipped.
  onboarding_completed_at?: string | null;
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
  receipt_file_type: string | null;
  account_debit: string;
  account_label: string;
  notes: string;
  analysis_status: ReceiptAnalysisStatus;
  analysis_raw: Record<string, unknown> | null;
  analysis_cost: number | null;
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
  budget_hours?: number | null;
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
  role_id?: string | null;
  created_at: string;
  updated_at: string;
}

// SCH-366 — Custom-Rollen-System (Admin-verwaltet, pro Firma).

export interface CompanyRole {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRoleAssignment {
  id: string;
  company_id: string;
  user_id: string;
  role_id: string;
  created_at: string;
}

// SCH-366 — Smart-Insights-Konfiguration (Admin-setzbare Schwellwerte).

export interface SmartInsightsConfig {
  id: string;
  company_id: string;
  billable_rate_min: number;
  period_growth_threshold: number;
  top_project_share_max: number;
  budget_overshoot_warn_pct: number;
  budget_overshoot_critical_pct: number;
  overtime_threshold_pct: number;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_SMART_INSIGHTS_CONFIG: Omit<SmartInsightsConfig, "id" | "company_id" | "created_at" | "updated_at"> = {
  billable_rate_min: 0.6,
  period_growth_threshold: 0.3,
  top_project_share_max: 0.4,
  budget_overshoot_warn_pct: 0.8,
  budget_overshoot_critical_pct: 0.95,
  overtime_threshold_pct: 0.1,
};

// SCH-921 K2-J1 — Admin-managed labels for the Zeiterfassung "Allgemein" /
// "Sonstiges" tabs. Replaces the hardcoded GENERAL_ITEMS / OTHER_ITEMS lists.
export type GeneralCategoryGroup = "allgemein" | "sonstiges";

export interface GeneralCategory {
  id: string;
  company_id: string;
  label: string;
  group_key: GeneralCategoryGroup;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Fallback labels used only when the company has no `general_categories`
// rows yet (e.g. legacy companies migrated before the SCH-921 seed). Keeps
// the modal usable even on a fresh tenant.
export const DEFAULT_GENERAL_CATEGORIES: { label: string; group_key: GeneralCategoryGroup }[] = [
  { label: "Daily", group_key: "allgemein" },
  { label: "Weekly", group_key: "allgemein" },
  { label: "Meeting Team", group_key: "allgemein" },
  { label: "Meeting Agentur", group_key: "allgemein" },
  { label: "Neues Projekt", group_key: "allgemein" },
  { label: "Briefing", group_key: "allgemein" },
  { label: "Administration", group_key: "allgemein" },
  { label: "E-Mails", group_key: "allgemein" },
  { label: "Weiterbildung", group_key: "sonstiges" },
  { label: "Reise", group_key: "sonstiges" },
  { label: "Krankheit", group_key: "sonstiges" },
  { label: "Urlaub", group_key: "sonstiges" },
  { label: "Sonstiges", group_key: "sonstiges" },
];

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

// SCH-440 — Quote Design System

export type QuoteDesignKey = "classic" | "modern" | "minimal" | "bold" | "ai_custom";

export const QUOTE_DESIGN_OPTIONS: { value: QuoteDesignKey; label: string; label_en: string }[] = [
  { value: "classic", label: "Klassisch", label_en: "Classic" },
  { value: "modern", label: "Modern", label_en: "Modern" },
  { value: "minimal", label: "Minimalistisch", label_en: "Minimal" },
  { value: "bold", label: "Markant", label_en: "Bold" },
  { value: "ai_custom", label: "AI Custom", label_en: "AI Custom" },
];

export interface QuoteDesignAIPayload {
  coverTitle: string;
  coverSubtitle: string;
  coverTagline: string;
  introText: string;
  accentColor: string;
  recommendedPalette: {
    accent: string;
    accentLight: string;
    dark: string;
    bg: string;
  };
  coverHtml?: string;
  generatedAt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUSD: number;
}

export interface QuoteDesignPhoto {
  id: string;
  company_id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  alt_text: string | null;
  ai_generated: boolean;
  ai_prompt: string | null;
  created_at: string;
}

export interface QuoteDesignSelection {
  id: string;
  company_id: string;
  quote_id: string;
  design_key: QuoteDesignKey;
  photo_ids: string[];
  ai_generated_payload: QuoteDesignAIPayload | null;
  created_at: string;
  updated_at: string;
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
