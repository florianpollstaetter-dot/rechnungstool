import { createClient } from "./supabase/client";
import {
  Customer,
  Invoice,
  InvoiceItem,
  CompanySettings,
  Product,
  Project,
  ProjectStatus,
  Quote,
  QuoteItem,
  FixedCost,
  Receipt,
  ExpenseReport,
  ExpenseItem,
  Task,
  TaskStatus,
  TimeEntry,
  UserDashboardLayout,
  UserProfile,
  UserWorkSchedule,
  BankStatement,
  BankTransaction,
  Template,
  TemplateItem,
  TemplateType,
  Language,
  DisplayMode,
  CompanyRole,
  UserRoleAssignment,
  SmartInsightsConfig,
  DEFAULT_SMART_INSIGHTS_CONFIG,
  QuoteDesignPhoto,
  QuoteDesignSelection,
  QuoteDesignKey,
} from "./types";

const DEFAULT_SETTINGS: CompanySettings = {
  id: "default",
  company_name: "",
  company_type: "gmbh",
  address: "",
  city: "",
  zip: "",
  country: "AT",
  uid: "",
  firmenbuchnummer: "",
  firmenbuchgericht: "",
  firmenbuchnummer_komplementaer: "",
  firmenbuchgericht_komplementaer: "",
  is_kleinunternehmer: false,
  iban: "",
  bic: "",
  phone: "",
  email: "",
  logo_url: "",
  default_tax_rate: 20,
  default_payment_terms_days: 14,
  next_invoice_number: 1,
  next_quote_number: 1,
  accompanying_text_de: "Vielen Dank fuer Ihren Auftrag!",
  accompanying_text_en: "Thank you for your order!",
  accompanying_text_translations: {
    de: "Vielen Dank fuer Ihren Auftrag!",
    en: "Thank you for your order!",
  },
  industry: "",
  website: "",
  description: "",
};

function supabase() {
  return createClient();
}

export function getCurrentUserName(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("currentUserName") || "";
  }
  return "";
}

function getActiveCompanyId(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("activeCompanyId") || "vrthefans";
  }
  return "vrthefans";
}

// User Profiles
export async function getUserProfile(authUserId: string): Promise<UserProfile | null> {
  const { data } = await supabase().from("user_profiles").select("*").eq("auth_user_id", authUserId).single();
  return data ? mapUserProfile(data) : null;
}

export async function getUserProfiles(): Promise<UserProfile[]> {
  const { data } = await supabase().from("user_profiles").select("*").order("created_at", { ascending: true });
  return (data ?? []).map(mapUserProfile);
}

export async function createUserProfile(profile: Omit<UserProfile, "id" | "created_at">): Promise<UserProfile> {
  const { data } = await supabase().from("user_profiles").insert({
    ...profile,
    company_access: JSON.stringify(profile.company_access),
  }).select().single();
  return mapUserProfile(data!);
}

export async function updateUserProfile(id: string, updates: Partial<UserProfile>): Promise<UserProfile> {
  const payload: Record<string, unknown> = { ...updates };
  if (updates.company_access) payload.company_access = JSON.stringify(updates.company_access);
  const { data } = await supabase().from("user_profiles").update(payload).eq("id", id).select().single();
  return mapUserProfile(data!);
}

export async function deleteUserProfile(id: string): Promise<void> {
  await supabase().from("user_profiles").delete().eq("id", id);
}

// Company Settings
/** Resolve per-user accompanying text. Returns the user's own text if set, otherwise null (caller falls back to company settings). */
export async function getUserAccompanyingText(language: "de" | "en"): Promise<string | null> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return null;
  const profile = await getUserProfile(user.id);
  if (!profile) return null;
  const text = language === "en" ? profile.accompanying_text_en : profile.accompanying_text_de;
  return text || null;
}

export async function getSettings(): Promise<CompanySettings> {
  const companyId = getActiveCompanyId();
  const { data } = await supabase()
    .from("company_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();
  if (!data) return DEFAULT_SETTINGS;
  const merged = { ...DEFAULT_SETTINGS, ...data } as Record<string, unknown>;
  const deText = (data.accompanying_text_de as string) || DEFAULT_SETTINGS.accompanying_text_de;
  const enText = (data.accompanying_text_en as string) || DEFAULT_SETTINGS.accompanying_text_en;
  merged.accompanying_text_translations = normalizeTranslations(
    data.accompanying_text_translations,
    { de: deText, en: enText },
  );
  return merged as unknown as CompanySettings;
}

export async function updateSettings(
  settings: Partial<CompanySettings>
): Promise<CompanySettings> {
  const companyId = getActiveCompanyId();
  const { data } = await supabase()
    .from("company_settings")
    .update(settings)
    .eq("company_id", companyId)
    .select()
    .single();
  return data!;
}

// Customers
export async function getCustomers(): Promise<Customer[]> {
  const { data } = await supabase()
    .from("customers").select("*").eq("company_id", getActiveCompanyId()).order("created_at", { ascending: false });
  return (data ?? []).map(mapCustomer);
}

export async function getCustomer(
  id: string
): Promise<Customer | undefined> {
  const { data } = await supabase()
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("company_id", getActiveCompanyId())
    .single();
  return data ? mapCustomer(data) : undefined;
}

export async function createCustomer(
  customer: Omit<Customer, "id" | "created_at">
): Promise<Customer> {
  const { data, error } = await supabase()
    .from("customers")
    .insert({ ...customer, company_id: getActiveCompanyId() })
    .select()
    .single();
  if (error) throw new Error(`createCustomer failed: ${error.message}`);
  return mapCustomer(data!);
}

export async function updateCustomer(
  id: string,
  updates: Partial<Customer>
): Promise<Customer> {
  const { data, error } = await supabase()
    .from("customers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateCustomer failed: ${error.message}`);
  return mapCustomer(data!);
}

export async function deleteCustomer(id: string): Promise<void> {
  await supabase().from("customers").delete().eq("id", id);
}

// Products
export async function getProducts(): Promise<Product[]> {
  const { data } = await supabase()
    .from("products").select("*").eq("company_id", getActiveCompanyId()).order("name", { ascending: true });
  return (data ?? []).map(mapProduct);
}

export async function getActiveProducts(): Promise<Product[]> {
  const { data } = await supabase()
    .from("products").select("*").eq("company_id", getActiveCompanyId()).eq("active", true)
    .order("name", { ascending: true });
  return (data ?? []).map(mapProduct);
}

export async function createProduct(
  product: Omit<Product, "id" | "created_at">
): Promise<Product> {
  const { data } = await supabase()
    .from("products")
    .insert({ ...product, company_id: getActiveCompanyId() })
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
    .from("invoices").select("*").eq("company_id", getActiveCompanyId()).order("created_at", { ascending: false });
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
    .eq("company_id", getActiveCompanyId())
    .single();
  if (!inv) return undefined;

  const { data: items } = await supabase()
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position", { ascending: true });

  return mapInvoice(inv, (items ?? []).map(mapInvoiceItem));
}

export async function getInvoicesForQuote(quoteId: string): Promise<Invoice[]> {
  const { data: invoices } = await supabase()
    .from("invoices")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .ilike("notes", `%[source_quote:${quoteId}]%`)
    .order("created_at", { ascending: true });
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
      company_id: getActiveCompanyId(),
    })
    .select()
    .single();

  if (items.length > 0) {
    await supabase()
      .from("invoice_items")
      .insert(
        items.map((item) => ({
          invoice_id: inv!.id,
          company_id: getActiveCompanyId(),
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
    .from("quotes").select("*").eq("company_id", getActiveCompanyId()).order("created_at", { ascending: false });
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
    .eq("company_id", getActiveCompanyId())
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
      company_id: getActiveCompanyId(),
    })
    .select()
    .single();

  if (items.length > 0) {
    await supabase()
      .from("quote_items")
      .insert(
        items.map((item) => ({
          quote_id: q!.id,
          company_id: getActiveCompanyId(),
          position: item.position,
          description: item.description,
          unit: item.unit || "Stueck",
          product_id: item.product_id || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          discount_amount: item.discount_amount || 0,
          total: item.total,
          role_id: item.role_id || null,
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
            role_id: item.role_id || null,
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
    e_invoice_format: "none",
        created_by: null,
  });

  await updateQuote(quoteId, {
    status: "accepted",
    converted_invoice_id: invoice.id,
  });

  return invoice;
}

// Expense Reports
export async function getExpenseReports(): Promise<ExpenseReport[]> {
  const { data } = await supabase().from("expense_reports").select("*").eq("company_id", getActiveCompanyId()).order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({ ...r, id: r.id as string } as ExpenseReport));
}

export async function createExpenseReport(report: Omit<ExpenseReport, "id" | "created_at">): Promise<ExpenseReport> {
  const { data } = await supabase().from("expense_reports").insert({ ...report, company_id: getActiveCompanyId() }).select().single();
  return data as unknown as ExpenseReport;
}

export async function updateExpenseReport(id: string, updates: Partial<ExpenseReport>): Promise<void> {
  await supabase().from("expense_reports").update(updates).eq("id", id);
}

export async function deleteExpenseReport(id: string): Promise<void> {
  await supabase().from("expense_items").delete().eq("expense_report_id", id);
  await supabase().from("expense_reports").delete().eq("id", id);
}

// Expense Items
export async function getExpenseItems(): Promise<ExpenseItem[]> {
  const { data } = await supabase().from("expense_items").select("*").eq("company_id", getActiveCompanyId()).order("date", { ascending: true });
  return (data ?? []).map((i) => ({ ...i, id: i.id as string } as ExpenseItem));
}

export async function createExpenseItem(item: Omit<ExpenseItem, "id" | "created_at">): Promise<ExpenseItem> {
  const { data } = await supabase().from("expense_items").insert({ ...item, company_id: getActiveCompanyId() }).select().single();
  return data as unknown as ExpenseItem;
}

export async function updateExpenseItem(id: string, updates: Partial<ExpenseItem>): Promise<void> {
  await supabase().from("expense_items").update(updates).eq("id", id);
}

export async function deleteExpenseItem(id: string): Promise<void> {
  const { data } = await supabase().from("expense_items").select("receipt_file_path").eq("id", id).single();
  if (data?.receipt_file_path) {
    await supabase().storage.from("receipts").remove([data.receipt_file_path]);
  }
  await supabase().from("expense_items").delete().eq("id", id);
}

// Time Entries
export async function getTimeEntries(userId?: string): Promise<TimeEntry[]> {
  let query = supabase().from("time_entries").select("*").eq("company_id", getActiveCompanyId()).order("start_time", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query;
  return (data ?? []).map((t) => ({ ...t, id: t.id as string } as TimeEntry));
}

export async function getActiveTimer(userId: string): Promise<TimeEntry | null> {
  const { data } = await supabase().from("time_entries").select("*").eq("company_id", getActiveCompanyId()).eq("user_id", userId).is("end_time", null).single();
  return data ? ({ ...data, id: data.id as string } as TimeEntry) : null;
}

export async function createTimeEntry(entry: Omit<TimeEntry, "id" | "created_at">): Promise<TimeEntry> {
  const { data, error } = await supabase().from("time_entries").insert({ ...entry, company_id: getActiveCompanyId() }).select().single();
  if (error) throw new Error(`createTimeEntry failed: ${error.message}`);
  return data as unknown as TimeEntry;
}

export async function updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<void> {
  await supabase().from("time_entries").update(updates).eq("id", id);
}

export async function deleteTimeEntry(id: string): Promise<void> {
  await supabase().from("time_entries").delete().eq("id", id);
}

// User Work Schedules (per-user weekly pensum — SCH-369)
export async function getUserWorkSchedules(userId: string): Promise<UserWorkSchedule[]> {
  const { data } = await supabase()
    .from("user_work_schedules")
    .select("*")
    .eq("user_id", userId)
    .order("weekday", { ascending: true });
  return (data ?? []).map(mapUserWorkSchedule);
}

export async function getCurrentUserWorkSchedules(): Promise<UserWorkSchedule[]> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return [];
  const profile = await getUserProfile(user.id);
  if (!profile) return [];
  return getUserWorkSchedules(profile.id);
}

export async function upsertUserWorkSchedule(
  schedule: Omit<UserWorkSchedule, "id" | "created_at" | "updated_at">
): Promise<UserWorkSchedule> {
  const { data } = await supabase()
    .from("user_work_schedules")
    .upsert(
      { ...schedule, updated_at: new Date().toISOString() },
      { onConflict: "user_id,weekday" }
    )
    .select()
    .single();
  return mapUserWorkSchedule(data!);
}

export async function deleteUserWorkSchedule(userId: string, weekday: number): Promise<void> {
  await supabase()
    .from("user_work_schedules")
    .delete()
    .eq("user_id", userId)
    .eq("weekday", weekday);
}

// Replace the entire weekly schedule for a user in one round-trip pair (delete
// of removed weekdays + bulk upsert of kept rows). Each row's
// daily_target_minutes/Von–Bis is validated against the same rules the DB
// enforces; rejected rows throw before any write so a partial save can't
// leave the user with a half-applied schedule.
export async function replaceUserWorkSchedules(
  userId: string,
  rows: Array<Omit<UserWorkSchedule, "id" | "user_id" | "created_at" | "updated_at">>
): Promise<UserWorkSchedule[]> {
  // Lazy import keeps work-schedule.ts free of supabase deps.
  const { validateScheduleRow, isEmptyRow } = await import("./work-schedule");

  const kept: typeof rows = [];
  const removedWeekdays: number[] = [];
  for (let i = 0; i < 7; i++) {
    const row = rows.find((r) => r.weekday === i);
    if (!row || isEmptyRow(row)) {
      removedWeekdays.push(i);
      continue;
    }
    const errs = validateScheduleRow(row);
    if (errs.length > 0) {
      throw new Error(`Ungültiges Arbeitszeitmodell für Wochentag ${i}: ${errs.join(", ")}`);
    }
    kept.push(row);
  }

  const sb = supabase();

  if (removedWeekdays.length > 0) {
    await sb
      .from("user_work_schedules")
      .delete()
      .eq("user_id", userId)
      .in("weekday", removedWeekdays);
  }

  if (kept.length === 0) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("user_work_schedules")
    .upsert(
      kept.map((r) => ({ ...r, user_id: userId, updated_at: nowIso })),
      { onConflict: "user_id,weekday" }
    )
    .select();

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapUserWorkSchedule);
}

// Projects (SCH-366 Modul 4) ------------------------------------------------
export async function getProjects(): Promise<Project[]> {
  const { data } = await supabase()
    .from("projects")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapProject);
}

export async function getProject(id: string): Promise<Project | null> {
  const { data } = await supabase().from("projects").select("*").eq("id", id).eq("company_id", getActiveCompanyId()).single();
  return data ? mapProject(data) : null;
}

export async function getProjectByQuoteId(quoteId: string): Promise<Project | null> {
  const { data } = await supabase()
    .from("projects")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .eq("quote_id", quoteId)
    .maybeSingle();
  return data ? mapProject(data) : null;
}

export async function createProject(
  project: Omit<Project, "id" | "company_id" | "created_at" | "updated_at">
): Promise<Project> {
  const { data, error } = await supabase()
    .from("projects")
    .insert({ ...project, company_id: getActiveCompanyId() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapProject(data!);
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const { data, error } = await supabase()
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapProject(data!);
}

export async function deleteProject(id: string): Promise<void> {
  await supabase().from("projects").delete().eq("id", id);
}

// Tasks (SCH-366 Modul 4) ---------------------------------------------------
export async function getTasks(projectId?: string): Promise<Task[]> {
  let query = supabase()
    .from("tasks")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (projectId) query = query.eq("project_id", projectId);
  const { data } = await query;
  return (data ?? []).map(mapTask);
}

export async function getTask(id: string): Promise<Task | null> {
  const { data } = await supabase().from("tasks").select("*").eq("id", id).eq("company_id", getActiveCompanyId()).single();
  return data ? mapTask(data) : null;
}

export async function createTask(
  task: Omit<Task, "id" | "company_id" | "created_at" | "updated_at">
): Promise<Task> {
  const { data, error } = await supabase()
    .from("tasks")
    .insert({ ...task, company_id: getActiveCompanyId() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapTask(data!);
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const { data, error } = await supabase()
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapTask(data!);
}

export async function deleteTask(id: string): Promise<void> {
  await supabase().from("tasks").delete().eq("id", id);
}

// Promote a Quote into a Project + Tasks (one per QuoteItem). Idempotent on
// quote_id: if a project already exists for this quote, we return it without
// re-inserting tasks. Safe to call from the UI on quote acceptance; the server
// route (/api/projects/create-from-quote) uses the same logic with the
// service-role client.
export async function createProjectFromQuote(quoteId: string): Promise<Project> {
  const existing = await getProjectByQuoteId(quoteId);
  if (existing) return existing;

  const quote = await getQuote(quoteId);
  if (!quote) throw new Error(`Angebot ${quoteId} nicht gefunden`);

  const projectName = quote.project_description?.trim()
    ? quote.project_description.trim()
    : `Angebot ${quote.quote_number}`;

  // Compute total budget hours from Stunden-items.
  const budgetHours = quote.items.reduce((sum, item) => {
    if (item.unit === "Stunden" && item.quantity > 0) return sum + item.quantity;
    return sum;
  }, 0);

  const project = await createProject({
    name: projectName,
    color: null,
    status: "active",
    quote_id: quoteId,
    budget_hours: budgetHours > 0 ? budgetHours : null,
  });

  if (quote.items.length > 0) {
    const sb = supabase();
    const companyId = getActiveCompanyId();
    const { error } = await sb.from("tasks").insert(
      quote.items.map((item, idx) => ({
        company_id: companyId,
        project_id: project.id,
        title: item.description?.trim() || `Position ${item.position}`,
        description: null,
        status: "open" as TaskStatus,
        assignee_user_id: null,
        due_date: null,
        estimated_hours:
          item.unit === "Stunden" && item.quantity > 0 ? item.quantity : null,
        position: item.position ?? idx + 1,
        role_id: item.role_id ?? null,
      }))
    );
    if (error) throw new Error(error.message);
  }

  return project;
}

// User Dashboard Layouts (SCH-366 Modul 1) ----------------------------------
const DEFAULT_DASHBOARD_KEY = "main";

export async function getUserDashboardLayout(
  userId: string,
  dashboardKey: string = DEFAULT_DASHBOARD_KEY
): Promise<UserDashboardLayout | null> {
  const { data } = await supabase()
    .from("user_dashboard_layouts")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .eq("user_id", userId)
    .eq("dashboard_key", dashboardKey)
    .maybeSingle();
  return data ? mapUserDashboardLayout(data) : null;
}

export async function upsertUserDashboardLayout(
  userId: string,
  layoutJson: unknown,
  dashboardKey: string = DEFAULT_DASHBOARD_KEY
): Promise<UserDashboardLayout> {
  const { data, error } = await supabase()
    .from("user_dashboard_layouts")
    .upsert(
      {
        company_id: getActiveCompanyId(),
        user_id: userId,
        dashboard_key: dashboardKey,
        layout_json: layoutJson,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,user_id,dashboard_key" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapUserDashboardLayout(data!);
}

export async function deleteUserDashboardLayout(
  userId: string,
  dashboardKey: string = DEFAULT_DASHBOARD_KEY
): Promise<void> {
  await supabase()
    .from("user_dashboard_layouts")
    .delete()
    .eq("company_id", getActiveCompanyId())
    .eq("user_id", userId)
    .eq("dashboard_key", dashboardKey);
}

// Company Roles (SCH-366 — Custom-Rollen-System) -----------------------------

export async function getCompanyRoles(): Promise<CompanyRole[]> {
  const { data } = await supabase()
    .from("company_roles")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .order("name");
  return (data ?? []).map(mapCompanyRole);
}

export async function getCompanyRole(id: string): Promise<CompanyRole | null> {
  const { data } = await supabase()
    .from("company_roles")
    .select("*")
    .eq("id", id)
    .eq("company_id", getActiveCompanyId())
    .maybeSingle();
  return data ? mapCompanyRole(data) : null;
}

export async function createCompanyRole(
  role: Pick<CompanyRole, "name" | "description" | "color">
): Promise<CompanyRole> {
  const { data, error } = await supabase()
    .from("company_roles")
    .insert({ ...role, company_id: getActiveCompanyId() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapCompanyRole(data!);
}

export async function updateCompanyRole(
  id: string,
  updates: Partial<Pick<CompanyRole, "name" | "description" | "color">>
): Promise<CompanyRole> {
  const { data, error } = await supabase()
    .from("company_roles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", getActiveCompanyId())
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapCompanyRole(data!);
}

export async function deleteCompanyRole(id: string): Promise<void> {
  await supabase()
    .from("company_roles")
    .delete()
    .eq("id", id)
    .eq("company_id", getActiveCompanyId());
}

// User ↔ Role assignments ----------------------------------------------------

export async function getUserRoleAssignments(
  userId: string
): Promise<UserRoleAssignment[]> {
  const { data } = await supabase()
    .from("user_role_assignments")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .eq("user_id", userId);
  return (data ?? []).map(mapUserRoleAssignment);
}

export async function assignRoleToUser(
  userId: string,
  roleId: string
): Promise<UserRoleAssignment> {
  const { data, error } = await supabase()
    .from("user_role_assignments")
    .upsert(
      { company_id: getActiveCompanyId(), user_id: userId, role_id: roleId },
      { onConflict: "user_id,role_id" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapUserRoleAssignment(data!);
}

export async function removeRoleFromUser(
  userId: string,
  roleId: string
): Promise<void> {
  await supabase()
    .from("user_role_assignments")
    .delete()
    .eq("user_id", userId)
    .eq("role_id", roleId);
}

/** Alle User die eine bestimmte Rolle haben — für Auto-Suggestion. */
export async function getUsersWithRole(
  roleId: string
): Promise<{ userId: string; displayName: string }[]> {
  const { data } = await supabase()
    .from("user_role_assignments")
    .select("user_id, user_profiles!inner(display_name)")
    .eq("company_id", getActiveCompanyId())
    .eq("role_id", roleId);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    userId: row.user_id as string,
    displayName:
      (row.user_profiles as Record<string, unknown>)?.display_name as string ??
      "",
  }));
}

// Smart Insights Config (SCH-366 — Admin-konfigurierbare Schwellwerte) --------

export async function getSmartInsightsConfig(): Promise<SmartInsightsConfig> {
  const { data } = await supabase()
    .from("smart_insights_config")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .maybeSingle();
  if (data) return mapSmartInsightsConfig(data);
  // Return defaults if no row exists for this company.
  return {
    id: "",
    company_id: getActiveCompanyId(),
    ...DEFAULT_SMART_INSIGHTS_CONFIG,
    created_at: "",
    updated_at: "",
  };
}

export async function upsertSmartInsightsConfig(
  config: Partial<Omit<SmartInsightsConfig, "id" | "company_id" | "created_at" | "updated_at">>
): Promise<SmartInsightsConfig> {
  const { data, error } = await supabase()
    .from("smart_insights_config")
    .upsert(
      {
        company_id: getActiveCompanyId(),
        ...config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapSmartInsightsConfig(data!);
}

// Bank Statements
export async function getBankStatements(): Promise<BankStatement[]> {
  const { data } = await supabase().from("bank_statements").select("*").eq("company_id", getActiveCompanyId()).order("created_at", { ascending: false });
  return (data ?? []).map(mapBankStatement);
}

export async function createBankStatement(stmt: Omit<BankStatement, "id" | "created_at" | "updated_at">): Promise<BankStatement> {
  const { data } = await supabase().from("bank_statements").insert({ ...stmt, company_id: getActiveCompanyId() }).select().single();
  return mapBankStatement(data!);
}

export async function deleteBankStatement(id: string): Promise<void> {
  await supabase().from("bank_transactions").delete().eq("statement_id", id);
  await supabase().from("bank_statements").delete().eq("id", id);
}

export async function getTransactions(statementId?: string): Promise<BankTransaction[]> {
  let query = supabase().from("bank_transactions").select("*").eq("company_id", getActiveCompanyId()).order("booking_date", { ascending: false });
  if (statementId) query = query.eq("statement_id", statementId);
  const { data } = await query;
  return (data ?? []).map(mapBankTransaction);
}

export async function createTransaction(tx: Omit<BankTransaction, "id" | "created_at" | "updated_at">): Promise<BankTransaction> {
  const { data } = await supabase().from("bank_transactions").insert({ ...tx, company_id: getActiveCompanyId() }).select().single();
  return mapBankTransaction(data!);
}

export async function updateTransaction(id: string, updates: Partial<BankTransaction>): Promise<BankTransaction> {
  const { data } = await supabase().from("bank_transactions").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  return mapBankTransaction(data!);
}

// Receipts
export async function getReceipts(): Promise<Receipt[]> {
  const { data } = await supabase().from("receipts").select("*").eq("company_id", getActiveCompanyId()).order("created_at", { ascending: false });
  return (data ?? []).map(mapReceipt);
}

export async function getReceipt(id: string): Promise<Receipt | undefined> {
  const { data } = await supabase().from("receipts").select("*").eq("id", id).eq("company_id", getActiveCompanyId()).single();
  return data ? mapReceipt(data) : undefined;
}

export async function createReceipt(receipt: Omit<Receipt, "id" | "created_at" | "updated_at">): Promise<Receipt> {
  const { data } = await supabase().from("receipts").insert({ ...receipt, company_id: getActiveCompanyId() }).select().single();
  return mapReceipt(data!);
}

export async function updateReceipt(id: string, updates: Partial<Receipt>): Promise<Receipt> {
  const { data } = await supabase().from("receipts").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  return mapReceipt(data!);
}

export async function deleteReceipt(id: string): Promise<void> {
  const receipt = await getReceipt(id);
  if (receipt) {
    await supabase().storage.from("receipts").remove([receipt.file_path]);
  }
  await supabase().from("receipts").delete().eq("id", id);
}

export async function uploadReceiptFile(file: File): Promise<{ path: string }> {
  const ext = file.name.split(".").pop() || "pdf";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase().storage.from("receipts").upload(path, file);
  if (error) throw new Error(error.message);
  return { path };
}

export function getReceiptFileUrl(path: string): string {
  const { data } = supabase().storage.from("receipts").getPublicUrl(path);
  return data.publicUrl;
}

// Templates
export async function getTemplates(type?: TemplateType): Promise<Template[]> {
  let query = supabase().from("templates").select("*").eq("company_id", getActiveCompanyId()).order("name", { ascending: true });
  if (type) query = query.eq("template_type", type);
  const { data } = await query;
  return (data ?? []).map(mapTemplate);
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  const { data } = await supabase().from("templates").select("*").eq("id", id).eq("company_id", getActiveCompanyId()).single();
  return data ? mapTemplate(data) : undefined;
}

export async function createTemplate(
  template: Omit<Template, "id" | "created_at">
): Promise<Template> {
  const { data } = await supabase()
    .from("templates")
    .insert({ ...template, items: JSON.stringify(template.items), company_id: getActiveCompanyId() })
    .select()
    .single();
  return mapTemplate(data!);
}

export async function deleteTemplate(id: string): Promise<void> {
  await supabase().from("templates").delete().eq("id", id);
}

// Fixed Costs
export async function getFixedCosts(): Promise<FixedCost[]> {
  const { data } = await supabase()
    .from("fixed_costs").select("*").eq("company_id", getActiveCompanyId()).order("name", { ascending: true });
  return (data ?? []).map(mapFixedCost);
}

export async function getActiveFixedCosts(): Promise<FixedCost[]> {
  const { data } = await supabase()
    .from("fixed_costs").select("*").eq("company_id", getActiveCompanyId()).eq("is_active", true)
    .order("name", { ascending: true });
  return (data ?? []).map(mapFixedCost);
}

export async function createFixedCost(
  cost: Omit<FixedCost, "id" | "created_at" | "updated_at">
): Promise<FixedCost> {
  const { data } = await supabase()
    .from("fixed_costs")
    .insert({ ...cost, company_id: getActiveCompanyId() })
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
    leitweg_id: (row.leitweg_id as string) || "",
    created_at: row.created_at as string,
  };
}

function mapProduct(row: Record<string, unknown>): Product {
  const nameDe = (row.name as string) || "";
  const nameEn = (row.name_en as string) || "";
  const descDe = (row.description as string) || "";
  const descEn = (row.description_en as string) || "";
  return {
    id: row.id as string,
    name: nameDe,
    description: descDe,
    name_en: nameEn,
    description_en: descEn,
    // SCH-447: JSONB may be absent on older rows — fall back to legacy de/en columns.
    name_translations: normalizeTranslations(row.name_translations, { de: nameDe, en: nameEn }),
    description_translations: normalizeTranslations(row.description_translations, { de: descDe, en: descEn }),
    unit: (row.unit as Product["unit"]) || "Stueck",
    unit_price: Number(row.unit_price),
    tax_rate: Number(row.tax_rate),
    active: row.active as boolean,
    role_id: (row.role_id as string) || null,
    created_at: row.created_at as string,
  };
}

function normalizeTranslations(
  raw: unknown,
  fallback: Partial<Record<"de" | "en" | "fr" | "es" | "it" | "tr" | "pl" | "ar", string>>,
): Partial<Record<"de" | "en" | "fr" | "es" | "it" | "tr" | "pl" | "ar", string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fallback)) {
    if (v) out[k] = v;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim() !== "") out[k] = v;
    }
  }
  return out;
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
    e_invoice_format: (row.e_invoice_format as Invoice["e_invoice_format"]) || "none",
    created_by: (row.created_by as string) || null,
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
    role_id: (row.role_id as string) || null,
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
    created_by: (row.created_by as string) || null,
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

function mapTemplate(row: Record<string, unknown>): Template {
  let items: TemplateItem[] = [];
  try {
    const raw = row.items;
    if (typeof raw === "string") items = JSON.parse(raw);
    else if (Array.isArray(raw)) items = raw as TemplateItem[];
  } catch { /* empty */ }
  return {
    id: row.id as string,
    name: row.name as string,
    template_type: (row.template_type as TemplateType) || "invoice",
    customer_id: (row.customer_id as string) || null,
    project_description: (row.project_description as string) || "",
    items,
    tax_rate: Number(row.tax_rate ?? 20),
    overall_discount_percent: Number(row.overall_discount_percent || 0),
    overall_discount_amount: Number(row.overall_discount_amount || 0),
    notes: (row.notes as string) || "",
    language: (row.language as Language) || "de",
    created_at: row.created_at as string,
  };
}

function mapReceipt(row: Record<string, unknown>): Receipt {
  return {
    id: row.id as string,
    file_name: row.file_name as string,
    file_path: row.file_path as string,
    file_type: row.file_type as string,
    file_size: Number(row.file_size || 0),
    invoice_date: (row.invoice_date as string) || null,
    purpose: (row.purpose as string) || null,
    issuer: (row.issuer as string) || null,
    amount_net: row.amount_net != null ? Number(row.amount_net) : null,
    amount_gross: row.amount_gross != null ? Number(row.amount_gross) : null,
    amount_vat: row.amount_vat != null ? Number(row.amount_vat) : null,
    vat_rate: row.vat_rate != null ? Number(row.vat_rate) : null,
    account_debit: (row.account_debit as string) || null,
    account_credit: (row.account_credit as string) || null,
    account_label: (row.account_label as string) || null,
    currency: (row.currency as string) || "EUR",
    payment_method: (row.payment_method as Receipt["payment_method"]) || "",
    analysis_cost: row.analysis_cost != null ? Number(row.analysis_cost) : null,
    notes: (row.notes as string) || null,
    analysis_status: (row.analysis_status as Receipt["analysis_status"]) || "pending",
    analysis_raw: (row.analysis_raw as Record<string, unknown>) || null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapBankStatement(row: Record<string, unknown>): BankStatement {
  return {
    id: row.id as string,
    file_name: row.file_name as string,
    upload_date: row.upload_date as string,
    statement_date: (row.statement_date as string) || null,
    bank_name: (row.bank_name as string) || null,
    account_iban: (row.account_iban as string) || null,
    currency: (row.currency as string) || "EUR",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapBankTransaction(row: Record<string, unknown>): BankTransaction {
  return {
    id: row.id as string,
    statement_id: row.statement_id as string,
    booking_date: (row.booking_date as string) || null,
    value_date: (row.value_date as string) || null,
    description: (row.description as string) || null,
    amount: Number(row.amount),
    balance_after: row.balance_after != null ? Number(row.balance_after) : null,
    counterpart_name: (row.counterpart_name as string) || null,
    counterpart_iban: (row.counterpart_iban as string) || null,
    reference: (row.reference as string) || null,
    matched_invoice_id: (row.matched_invoice_id as string) || null,
    match_confidence: row.match_confidence != null ? Number(row.match_confidence) : null,
    match_status: (row.match_status as BankTransaction["match_status"]) || "unmatched",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    name: (row.name as string) || "",
    color: (row.color as string) || null,
    status: (row.status as ProjectStatus) || "active",
    quote_id: (row.quote_id as string) || null,
    budget_hours: row.budget_hours != null ? Number(row.budget_hours) : null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    project_id: row.project_id as string,
    title: (row.title as string) || "",
    description: (row.description as string) || null,
    status: (row.status as TaskStatus) || "open",
    assignee_user_id: (row.assignee_user_id as string) || null,
    due_date: (row.due_date as string) || null,
    estimated_hours: row.estimated_hours != null ? Number(row.estimated_hours) : null,
    position: Number(row.position ?? 0),
    role_id: (row.role_id as string) || null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapCompanyRole(row: Record<string, unknown>): CompanyRole {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    name: (row.name as string) || "",
    description: (row.description as string) || null,
    color: (row.color as string) || null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapUserRoleAssignment(row: Record<string, unknown>): UserRoleAssignment {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    user_id: row.user_id as string,
    role_id: row.role_id as string,
    created_at: row.created_at as string,
  };
}

function mapSmartInsightsConfig(row: Record<string, unknown>): SmartInsightsConfig {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    billable_rate_min: Number(row.billable_rate_min ?? DEFAULT_SMART_INSIGHTS_CONFIG.billable_rate_min),
    period_growth_threshold: Number(row.period_growth_threshold ?? DEFAULT_SMART_INSIGHTS_CONFIG.period_growth_threshold),
    top_project_share_max: Number(row.top_project_share_max ?? DEFAULT_SMART_INSIGHTS_CONFIG.top_project_share_max),
    budget_overshoot_warn_pct: Number(row.budget_overshoot_warn_pct ?? DEFAULT_SMART_INSIGHTS_CONFIG.budget_overshoot_warn_pct),
    budget_overshoot_critical_pct: Number(row.budget_overshoot_critical_pct ?? DEFAULT_SMART_INSIGHTS_CONFIG.budget_overshoot_critical_pct),
    overtime_threshold_pct: Number(row.overtime_threshold_pct ?? DEFAULT_SMART_INSIGHTS_CONFIG.overtime_threshold_pct),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapUserDashboardLayout(row: Record<string, unknown>): UserDashboardLayout {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    user_id: row.user_id as string,
    dashboard_key: (row.dashboard_key as string) || "main",
    layout_json: row.layout_json ?? [],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapUserWorkSchedule(row: Record<string, unknown>): UserWorkSchedule {
  const trim = (v: unknown): string | null => {
    if (typeof v !== "string" || !v) return null;
    // Postgres time columns round-trip as "HH:MM:SS"; keep only "HH:MM".
    return v.length >= 5 ? v.slice(0, 5) : v;
  };
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    weekday: Number(row.weekday),
    start_time: trim(row.start_time),
    end_time: trim(row.end_time),
    daily_target_minutes: Number(row.daily_target_minutes ?? 0),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapUserProfile(row: Record<string, unknown>): UserProfile {
  let companyAccess: string[] = [];
  try {
    const raw = row.company_access;
    if (typeof raw === "string") companyAccess = JSON.parse(raw);
    else if (Array.isArray(raw)) companyAccess = raw as string[];
  } catch { /* empty */ }
  return {
    id: row.id as string,
    auth_user_id: row.auth_user_id as string,
    display_name: (row.display_name as string) || "",
    email: (row.email as string) || "",
    role: (row.role as UserProfile["role"]) || "employee",
    job_title: (row.job_title as string) || "",
    iban: (row.iban as string) || "",
    address: (row.address as string) || "",
    company_access: companyAccess,
    accompanying_text_de: (row.accompanying_text_de as string) || "",
    accompanying_text_en: (row.accompanying_text_en as string) || "",
    accompanying_text_translations: normalizeTranslations(row.accompanying_text_translations, {
      de: (row.accompanying_text_de as string) || "",
      en: (row.accompanying_text_en as string) || "",
    }),
    greeting_tone: ((row.greeting_tone as UserProfile["greeting_tone"]) || "motivating"),
    created_at: row.created_at as string,
  };
}

// ── SCH-440: Quote Design Photos & Selections ──

function mapDesignPhoto(row: Record<string, unknown>): QuoteDesignPhoto {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    file_path: row.file_path as string,
    file_name: row.file_name as string,
    file_type: (row.file_type as string) || "image/jpeg",
    file_size: (row.file_size as number) || 0,
    alt_text: (row.alt_text as string) || null,
    ai_generated: (row.ai_generated as boolean) || false,
    ai_prompt: (row.ai_prompt as string) || null,
    created_at: row.created_at as string,
  };
}

function mapDesignSelection(row: Record<string, unknown>): QuoteDesignSelection {
  let photoIds: string[] = [];
  try {
    const raw = row.photo_ids;
    if (typeof raw === "string") photoIds = JSON.parse(raw);
    else if (Array.isArray(raw)) photoIds = raw as string[];
  } catch { /* empty */ }
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    quote_id: row.quote_id as string,
    design_key: (row.design_key as QuoteDesignKey) || "classic",
    photo_ids: photoIds,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getDesignPhotos(): Promise<QuoteDesignPhoto[]> {
  const { data } = await supabase()
    .from("quote_design_photos")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapDesignPhoto);
}

export async function uploadDesignPhoto(file: File): Promise<QuoteDesignPhoto> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${getActiveCompanyId()}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase().storage.from("design-photos").upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data, error: insertError } = await supabase()
    .from("quote_design_photos")
    .insert({
      company_id: getActiveCompanyId(),
      file_path: path,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
    })
    .select()
    .single();
  if (insertError || !data) {
    await supabase().storage.from("design-photos").remove([path]);
    throw new Error(insertError?.message || "Photo metadata insert returned no row");
  }
  return mapDesignPhoto(data);
}

export async function saveAiGeneratedPhoto(
  imageUrl: string,
  prompt: string,
  fileName: string
): Promise<QuoteDesignPhoto> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const ext = fileName.split(".").pop() || "png";
  const path = `${getActiveCompanyId()}/ai-${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase().storage.from("design-photos").upload(path, blob, {
    contentType: blob.type || "image/png",
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error: insertError } = await supabase()
    .from("quote_design_photos")
    .insert({
      company_id: getActiveCompanyId(),
      file_path: path,
      file_name: fileName,
      file_type: blob.type || "image/png",
      file_size: blob.size,
      ai_generated: true,
      ai_prompt: prompt,
    })
    .select()
    .single();
  if (insertError || !data) {
    await supabase().storage.from("design-photos").remove([path]);
    throw new Error(insertError?.message || "Photo metadata insert returned no row");
  }
  return mapDesignPhoto(data);
}

export async function deleteDesignPhoto(id: string): Promise<void> {
  const { data } = await supabase()
    .from("quote_design_photos")
    .select("file_path")
    .eq("id", id)
    .single();
  if (data) {
    await supabase().storage.from("design-photos").remove([data.file_path as string]);
  }
  await supabase().from("quote_design_photos").delete().eq("id", id);
}

export function getDesignPhotoUrl(path: string): string {
  const { data } = supabase().storage.from("design-photos").getPublicUrl(path);
  return data.publicUrl;
}

export async function getDesignSelection(quoteId: string): Promise<QuoteDesignSelection | null> {
  const { data } = await supabase()
    .from("quote_design_selections")
    .select("*")
    .eq("quote_id", quoteId)
    .eq("company_id", getActiveCompanyId())
    .single();
  return data ? mapDesignSelection(data) : null;
}

export async function upsertDesignSelection(
  quoteId: string,
  designKey: QuoteDesignKey,
  photoIds: string[]
): Promise<QuoteDesignSelection> {
  const { data } = await supabase()
    .from("quote_design_selections")
    .upsert(
      {
        company_id: getActiveCompanyId(),
        quote_id: quoteId,
        design_key: designKey,
        photo_ids: JSON.stringify(photoIds),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "quote_id" }
    )
    .select()
    .single();
  return mapDesignSelection(data!);
}
