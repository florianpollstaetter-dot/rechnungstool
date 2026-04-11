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

export type InvoiceStatus = "entwurf" | "offen" | "bezahlt" | "ueberfaellig" | "storniert";

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
