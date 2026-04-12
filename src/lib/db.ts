import { createClient } from "./supabase/client";
import {
  Customer,
  Invoice,
  InvoiceItem,
  CompanySettings,
  Product,
  Quote,
  QuoteItem,
  FixedCost,
  Language,
  DisplayMode,
} from "./types";

const DEFAULT_SETTINGS: CompanySettings = {
  id: "default",
  company_name: "VR the Fans GmbH",
  company_type: "gmbh",
  address: "Gastgebgasse 3/243",
  city: "Wien",
  zip: "1230",
  uid: "ATU82587808",
  iban: "AT53 3506 2000 0020 5658",
  bic: "RVSAAT2S062",
  phone: "+43 664 389 91 38",
  email: "office@vrthefans.com",
  logo_url: "/logo.png",
  default_tax_rate: 20,
  default_payment_terms_days: 14,
  next_invoice_number: 1,
  next_quote_number: 1,
  accompanying_text_de: "Vielen Dank fuer Ihren Auftrag! Wir freuen uns auf die weitere Zusammenarbeit.",
  accompanying_text_en: "Thank you for your order! We look forward to our continued collaboration.",
};

function supabase() {
  return createClient();
}

// Company Settings
export async function getSettings(): Promise<CompanySettings> {
  const { data } = await supabase()
    .from("company_settings")
    .select("*")
    .eq("id", "default")
    .single();
  return data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS;
}

export async function updateSettings(
  settings: Partial<CompanySettings>
): Promise<CompanySettings> {
  const { data } = await supabase()
    .from("company_settings")
    .update(settings)
    .eq("id", "default")
    .select()
    .single();
  return data!;
}

// Customers
export async function getCustomers(): Promise<Customer[]> {
  const { data } = await supabase()
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapCustomer);
}

export async function getCustomer(
  id: string
): Promise<Customer | undefined> {
  const { data } = await supabase()
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();
  return data ? mapCustomer(data) : undefined;
}

export async function createCustomer(
  customer: Omit<Customer, "id" | "created_at">
): Promise<Customer> {
  const { data } = await supabase()
    .from("customers")
    .insert(customer)
    .select()
    .single();
  return mapCustomer(data!);
}

export async function updateCustomer(
  id: string,
  updates: Partial<Customer>
): Promise<Customer> {
  const { data } = await supabase()
    .from("customers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return mapCustomer(data!);
}

export async function deleteCustomer(id: string): Promise<void> {
  await supabase().from("customers").delete().eq("id", id);
}

// Products
export async function getProducts(): Promise<Product[]> {
  const { data } = await supabase()
    .from("products")
    .select("*")
    .order("name", { ascending: true });
  return (data ?? []).map(mapProduct);
}

export async function getActiveProducts(): Promise<Product[]> {
  const { data } = await supabase()
    .from("products")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });
  return (data ?? []).map(mapProduct);
}

export async function createProduct(
  product: Omit<Product, "id" | "created_at">
): Promise<Product> {
  const { data } = await supabase()
    .from("products")
    .insert(product)
    .select()
    .single();
  return mapProduct(data!);
}

export async function updateProduct(
  id: string,
  updates: Partial<Product>
): Promise<Product> {
  const { data } = await supabase()
    .from("products")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return mapProduct(data!);
}

export async function deleteProduct(id: string): Promise<void> {
  await supabase().from("products").delete().eq("id", id);
}

// Invoices
export async function getInvoices(): Promise<Invoice[]> {
  const { data: invoices } = await supabase()
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });
  if (!invoices || invoices.length === 0) return [];

  const ids = invoices.map((i) => i.id);
  const { data: items } = await supabase()
    .from("invoice_items")
    .select("*")
    .in("invoice_id", ids)
    .order("position", { ascending: true });

  const itemsByInvoice = new Map<string, InvoiceItem[]>();
  (items ?? []).forEach((item) => {
    const list = itemsByInvoice.get(item.invoice_id) ?? [];
    list.push(mapInvoiceItem(item));
    itemsByInvoice.set(item.invoice_id, list);
  });

  return invoices.map((inv) => mapInvoice(inv, itemsByInvoice.get(inv.id) ?? []));
}

export async function getInvoice(
  id: string
): Promise<Invoice | undefined> {
  const { data: inv } = await supabase()
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();
  if (!inv) return undefined;

  const { data: items } = await supabase()
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position", { ascending: true });

  return mapInvoice(inv, (items ?? []).map(mapInvoiceItem));
}

export async function generateInvoiceNumber(): Promise<string> {
  const settings = await getSettings();
  const year = new Date().getFullYear();
  const num = settings.next_invoice_number;
  const number = `${year} - A${String(num).padStart(3, "0")}`;
  await updateSettings({ next_invoice_number: num + 1 });
  return number;
}

export async function createInvoice(
  invoice: Omit<Invoice, "id" | "created_at" | "invoice_number">
): Promise<Invoice> {
  const invoiceNumber = await generateInvoiceNumber();
  const { items, ...invoiceData } = invoice;

  const { data: inv } = await supabase()
    .from("invoices")
    .insert({
      ...invoiceData,
      invoice_number: invoiceNumber,
    })
    .select()
    .single();

  if (items.length > 0) {
    await supabase()
      .from("invoice_items")
      .insert(
        items.map((item) => ({
          invoice_id: inv!.id,
          position: item.position,
          description: item.description,
          unit: item.unit || "Stueck",
          product_id: item.product_id || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          discount_amount: item.discount_amount || 0,
          total: item.total,
        }))
      );
  }

  return mapInvoice(inv!, items);
}

export async function updateInvoice(
  id: string,
  data: Partial<Invoice>
): Promise<Invoice> {
  const { items, ...rest } = data;
  const { data: inv } = await supabase()
    .from("invoices")
    .update(rest)
    .eq("id", id)
    .select()
    .single();

  if (items) {
    await supabase().from("invoice_items").delete().eq("invoice_id", id);
    if (items.length > 0) {
      await supabase()
        .from("invoice_items")
        .insert(
          items.map((item) => ({
            invoice_id: id,
            position: item.position,
            description: item.description,
            unit: item.unit || "Stueck",
            product_id: item.product_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent || 0,
            discount_amount: item.discount_amount || 0,
            total: item.total,
          }))
        );
    }
    return mapInvoice(inv!, items);
  }

  const { data: currentItems } = await supabase()
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position", { ascending: true });

  return mapInvoice(inv!, (currentItems ?? []).map(mapInvoiceItem));
}

export async function cancelInvoice(id: string): Promise<Invoice> {
  return updateInvoice(id, { status: "storniert" });
}

export async function deleteInvoice(id: string): Promise<void> {
  await supabase().from("invoices").delete().eq("id", id);
}

// Quotes
export async function getQuotes(): Promise<Quote[]> {
  const { data: quotes } = await supabase()
    .from("quotes")
    .select("*")
    .order("created_at", { ascending: false });
  if (!quotes || quotes.length === 0) return [];

  const ids = quotes.map((q) => q.id);
  const { data: items } = await supabase()
    .from("quote_items")
    .select("*")
    .in("quote_id", ids)
    .order("position", { ascending: true });

  const itemsByQuote = new Map<string, QuoteItem[]>();
  (items ?? []).forEach((item) => {
    const list = itemsByQuote.get(item.quote_id) ?? [];
    list.push(mapQuoteItem(item));
    itemsByQuote.set(item.quote_id, list);
  });

  return quotes.map((q) => mapQuote(q, itemsByQuote.get(q.id) ?? []));
}

export async function getQuote(id: string): Promise<Quote | undefined> {
  const { data: q } = await supabase()
    .from("quotes")
    .select("*")
    .eq("id", id)
    .single();
  if (!q) return undefined;

  const { data: items } = await supabase()
    .from("quote_items")
    .select("*")
    .eq("quote_id", id)
    .order("position", { ascending: true });

  return mapQuote(q, (items ?? []).map(mapQuoteItem));
}

export async function generateQuoteNumber(): Promise<string> {
  const settings = await getSettings();
  const year = new Date().getFullYear();
  const num = settings.next_quote_number;
  const number = `${year} - Q${String(num).padStart(3, "0")}`;
  await updateSettings({ next_quote_number: num + 1 });
  return number;
}

export async function createQuote(
  quote: Omit<Quote, "id" | "created_at" | "quote_number">
): Promise<Quote> {
  const quoteNumber = await generateQuoteNumber();
  const { items, ...quoteData } = quote;

  const { data: q } = await supabase()
    .from("quotes")
    .insert({
      ...quoteData,
      quote_number: quoteNumber,
    })
    .select()
    .single();

  if (items.length > 0) {
    await supabase()
      .from("quote_items")
      .insert(
        items.map((item) => ({
          quote_id: q!.id,
          position: item.position,
          description: item.description,
          unit: item.unit || "Stueck",
          product_id: item.product_id || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          discount_amount: item.discount_amount || 0,
          total: item.total,
        }))
      );
  }

  return mapQuote(q!, items);
}

export async function updateQuote(
  id: string,
  data: Partial<Quote>
): Promise<Quote> {
  const { items, ...rest } = data;
  const { data: q } = await supabase()
    .from("quotes")
    .update(rest)
    .eq("id", id)
    .select()
    .single();

  if (items) {
    await supabase().from("quote_items").delete().eq("quote_id", id);
    if (items.length > 0) {
      await supabase()
        .from("quote_items")
        .insert(
          items.map((item) => ({
            quote_id: id,
            position: item.position,
            description: item.description,
            unit: item.unit || "Stueck",
            product_id: item.product_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent || 0,
            discount_amount: item.discount_amount || 0,
            total: item.total,
          }))
        );
    }
    return mapQuote(q!, items);
  }

  const { data: currentItems } = await supabase()
    .from("quote_items")
    .select("*")
    .eq("quote_id", id)
    .order("position", { ascending: true });

  return mapQuote(q!, (currentItems ?? []).map(mapQuoteItem));
}

export async function deleteQuote(id: string): Promise<void> {
  await supabase().from("quotes").delete().eq("id", id);
}

export async function convertQuoteToInvoice(quoteId: string): Promise<Invoice> {
  const quote = await getQuote(quoteId);
  if (!quote) throw new Error("Quote not found");

  const invoice = await createInvoice({
    customer_id: quote.customer_id,
    project_description: quote.project_description,
    invoice_date: new Date().toISOString().split("T")[0],
    delivery_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
    items: quote.items.map((item) => ({
      id: crypto.randomUUID(),
      position: item.position,
      description: item.description,
      unit: item.unit,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_percent: item.discount_percent,
      discount_amount: item.discount_amount,
      total: item.total,
    })),
    subtotal: quote.subtotal,
    tax_rate: quote.tax_rate,
    tax_amount: quote.tax_amount,
    total: quote.total,
    overall_discount_percent: quote.overall_discount_percent,
    overall_discount_amount: quote.overall_discount_amount,
    status: "offen",
    paid_at: null,
    paid_amount: 0,
    notes: quote.notes,
    language: quote.language || "de",
    accompanying_text: null,
  });

  await updateQuote(quoteId, {
    status: "accepted",
    converted_invoice_id: invoice.id,
  });

  return invoice;
}

// Fixed Costs
export async function getFixedCosts(): Promise<FixedCost[]> {
  const { data } = await supabase()
    .from("fixed_costs")
    .select("*")
    .order("name", { ascending: true });
  return (data ?? []).map(mapFixedCost);
}

export async function getActiveFixedCosts(): Promise<FixedCost[]> {
  const { data } = await supabase()
    .from("fixed_costs")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });
  return (data ?? []).map(mapFixedCost);
}

export async function createFixedCost(
  cost: Omit<FixedCost, "id" | "created_at" | "updated_at">
): Promise<FixedCost> {
  const { data } = await supabase()
    .from("fixed_costs")
    .insert(cost)
    .select()
    .single();
  return mapFixedCost(data!);
}

export async function updateFixedCost(
  id: string,
  updates: Partial<FixedCost>
): Promise<FixedCost> {
  const { data } = await supabase()
    .from("fixed_costs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  return mapFixedCost(data!);
}

export async function deleteFixedCost(id: string): Promise<void> {
  await supabase().from("fixed_costs").delete().eq("id", id);
}

// Mappers
function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string,
    name: row.name as string,
    company: row.company as string,
    address: row.address as string,
    city: row.city as string,
    zip: row.zip as string,
    country: row.country as string,
    uid_number: row.uid_number as string,
    email: row.email as string,
    phone: row.phone as string,
    created_at: row.created_at as string,
  };
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || "",
    name_en: (row.name_en as string) || "",
    description_en: (row.description_en as string) || "",
    unit: (row.unit as Product["unit"]) || "Stueck",
    unit_price: Number(row.unit_price),
    tax_rate: Number(row.tax_rate),
    active: row.active as boolean,
    created_at: row.created_at as string,
  };
}

function mapInvoiceItem(row: Record<string, unknown>): InvoiceItem {
  return {
    id: row.id as string,
    position: Number(row.position),
    description: row.description as string,
    unit: (row.unit as string) || "Stueck",
    product_id: (row.product_id as string) || null,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    discount_percent: Number(row.discount_percent || 0),
    discount_amount: Number(row.discount_amount || 0),
    total: Number(row.total),
  };
}

function mapInvoice(
  row: Record<string, unknown>,
  items: InvoiceItem[]
): Invoice {
  return {
    id: row.id as string,
    invoice_number: row.invoice_number as string,
    customer_id: row.customer_id as string,
    project_description: row.project_description as string,
    invoice_date: row.invoice_date as string,
    delivery_date: row.delivery_date as string,
    due_date: row.due_date as string,
    items,
    subtotal: Number(row.subtotal),
    tax_rate: Number(row.tax_rate),
    tax_amount: Number(row.tax_amount),
    total: Number(row.total),
    overall_discount_percent: Number(row.overall_discount_percent || 0),
    overall_discount_amount: Number(row.overall_discount_amount || 0),
    status: row.status as Invoice["status"],
    paid_at: (row.paid_at as string) ?? null,
    paid_amount: Number(row.paid_amount || 0),
    notes: row.notes as string,
    language: (row.language as Invoice["language"]) || "de",
    accompanying_text: (row.accompanying_text as string) ?? null,
    created_at: row.created_at as string,
  };
}

function mapQuoteItem(row: Record<string, unknown>): QuoteItem {
  return {
    id: row.id as string,
    position: Number(row.position),
    description: row.description as string,
    unit: (row.unit as string) || "Stueck",
    product_id: (row.product_id as string) || null,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    discount_percent: Number(row.discount_percent || 0),
    discount_amount: Number(row.discount_amount || 0),
    total: Number(row.total),
  };
}

function mapQuote(
  row: Record<string, unknown>,
  items: QuoteItem[]
): Quote {
  return {
    id: row.id as string,
    quote_number: row.quote_number as string,
    customer_id: row.customer_id as string,
    project_description: (row.project_description as string) || "",
    quote_date: row.quote_date as string,
    valid_until: row.valid_until as string,
    items,
    subtotal: Number(row.subtotal),
    tax_rate: Number(row.tax_rate),
    tax_amount: Number(row.tax_amount),
    total: Number(row.total),
    overall_discount_percent: Number(row.overall_discount_percent || 0),
    overall_discount_amount: Number(row.overall_discount_amount || 0),
    status: row.status as Quote["status"],
    notes: (row.notes as string) || "",
    language: (row.language as Language) || "de",
    display_mode: (row.display_mode as DisplayMode) || "detailed",
    converted_invoice_id: (row.converted_invoice_id as string) || null,
    created_at: row.created_at as string,
  };
}

function mapFixedCost(row: Record<string, unknown>): FixedCost {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || "",
    category: (row.category as string) || "other",
    amount: Number(row.amount),
    currency: (row.currency as string) || "EUR",
    vat_rate: Number(row.vat_rate ?? 20),
    interval: (row.interval as FixedCost["interval"]) || "monthly",
    start_date: row.start_date as string,
    end_date: (row.end_date as string) || null,
    is_active: row.is_active as boolean,
    account_number: (row.account_number as string) || "",
    account_label: (row.account_label as string) || "",
    supplier: (row.supplier as string) || "",
    notes: (row.notes as string) || "",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
