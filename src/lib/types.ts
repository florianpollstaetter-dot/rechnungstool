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
  notes: string | null;
  analysis_status: ReceiptAnalysisStatus;
  analysis_raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type FixedCostInterval = "monthly" | "quarterly" | "yearly";

export const FIXED_COST_INTERVAL_OPTIONS: { value: FixedCostInterval; label: string }[] = [
  { value: "monthly", label: "Monatlich" },
  { value: "quarterly", label: "Quartalsweise" },
  { value: "yearly", label: "Jaehrlich" },
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
