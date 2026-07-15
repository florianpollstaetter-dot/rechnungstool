import { createClient } from "./supabase/client";
import { requireRow, throwOnMutationError } from "./supabase/require-data";
import { computeSurchargeColumns, zeroSurchargeColumns } from "./surcharge/save-hook";
import type { TimeEntryType } from "./types";
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
  GeneralCategory,
  GeneralCategoryGroup,
  DEFAULT_GENERAL_CATEGORIES,
  Absence,
  AbsenceKind,
  UserLeaveBalance,
  QuoteDesignPhoto,
  QuoteDesignSelection,
  QuoteDesignKey,
  QuoteDesignAIPayload,
  WorkTimeModel,
  WorkTimeModelDay,
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
  accompanying_text_de: "Vielen Dank für Ihren Auftrag!",
  accompanying_text_en: "Thank you for your order!",
  accompanying_text_translations: {
    de: "Vielen Dank für Ihren Auftrag!",
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

// SCH-583 — defense-in-depth against cross-tenant user listing. RLS on
// user_profiles (post SCH-558) already scopes reads to same-company members,
// but callers in admin contexts should ALSO filter explicitly in code so a
// future RLS regression doesn't silently leak rows. Fetches the caller's
// company_members first, then pulls user_profiles whose auth_user_id is in
// company_members for any of those companies.
export async function getUserProfilesForMyCompanies(): Promise<UserProfile[]> {
  const {
    data: { user },
  } = await supabase().auth.getUser();
  if (!user) return [];

  const { data: myMemberships } = await supabase()
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id);

  const myCompanyIds = (myMemberships ?? []).map((m) => m.company_id as string);
  if (myCompanyIds.length === 0) return [];

  const { data: sameCompanyMembers } = await supabase()
    .from("company_members")
    .select("user_id")
    .in("company_id", myCompanyIds);

  const authUserIds = Array.from(
    new Set((sameCompanyMembers ?? []).map((m) => m.user_id as string)),
  );
  if (authUserIds.length === 0) return [];

  const { data } = await supabase()
    .from("user_profiles")
    .select("*")
    .in("auth_user_id", authUserIds)
    .order("created_at", { ascending: true });
  return (data ?? []).map(mapUserProfile);
}

export async function createUserProfile(profile: Omit<UserProfile, "id" | "created_at">): Promise<UserProfile> {
  const result = await supabase().from("user_profiles").insert({
    ...profile,
    company_access: JSON.stringify(profile.company_access),
  }).select().single();
  return mapUserProfile(requireRow(result, "createUserProfile"));
}

export async function updateUserProfile(id: string, updates: Partial<UserProfile>): Promise<UserProfile> {
  const payload: Record<string, unknown> = { ...updates };
  if (updates.company_access) payload.company_access = JSON.stringify(updates.company_access);
  const result = await supabase().from("user_profiles").update(payload).eq("id", id).select().single();
  return mapUserProfile(requireRow(result, "updateUserProfile"));
}

export async function deleteUserProfile(id: string): Promise<void> {
  const { error } = await supabase().from("user_profiles").delete().eq("id", id);
  if (error) throw new Error(`deleteUserProfile failed: ${error.message}`);
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
  // SCH-914 — match RLS USING clause (`id = active_company_id()`) on the
  // primary key, not the legacy `company_id` column. The two are equal in
  // every row post-SCH-505 backfill, but filtering on `id` removes the
  // last divergence between the WHERE and the row-level policy and avoids
  // silent "no row updated" failures.
  const result = await supabase()
    .from("company_settings")
    .update(settings)
    .eq("id", companyId)
    .select()
    .single();
  return requireRow(result, "updateSettings") as CompanySettings;
}

// SCH-958 — company logo upload to the public `company-logos` bucket.
// Storage RLS pins writes to `{active_company_id}/...`; the public CDN URL
// is what gets stored in `company_settings.logo_url` so PDFs can `<Image src=>`
// it directly without a signed-URL refresh.
export async function uploadCompanyLogo(file: File): Promise<string> {
  const companyId = getActiveCompanyId();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${companyId}/logo-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase()
    .storage.from("company-logos")
    .upload(path, file, { contentType: file.type || undefined, upsert: true });
  if (uploadError) throw new Error(uploadError.message);
  const { data: urlData } = supabase().storage.from("company-logos").getPublicUrl(path);
  const publicUrl = urlData.publicUrl;
  await updateSettings({ logo_url: publicUrl } as Partial<CompanySettings>);
  return publicUrl;
}

export async function removeCompanyLogo(): Promise<void> {
  const companyId = getActiveCompanyId();
  const { data: list } = await supabase()
    .storage.from("company-logos")
    .list(companyId);
  if (list && list.length > 0) {
    await supabase()
      .storage.from("company-logos")
      .remove(list.map((f) => `${companyId}/${f.name}`));
  }
  await updateSettings({ logo_url: "" } as Partial<CompanySettings>);
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
  const result = await supabase()
    .from("customers")
    .insert({ ...customer, company_id: getActiveCompanyId() })
    .select()
    .single();
  return mapCustomer(requireRow(result, "createCustomer"));
}

export async function updateCustomer(
  id: string,
  updates: Partial<Customer>
): Promise<Customer> {
  const result = await supabase()
    .from("customers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return mapCustomer(requireRow(result, "updateCustomer"));
}

export async function deleteCustomer(id: string): Promise<void> {
  throwOnMutationError(await supabase().from("customers").delete().eq("id", id), "deleteCustomer");
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
  // Strip JSONB translation columns — they don't exist in prod until the
  // ORA-2812 migration pipeline is unblocked. Legacy name/name_en columns
  // carry DE/EN; mapProduct() falls back to them on read.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name_translations, description_translations, ...rest } = product;
  const result = await supabase()
    .from("products")
    .insert({ ...rest, company_id: getActiveCompanyId() })
    .select()
    .single();
  return mapProduct(requireRow(result, "createProduct"));
}

export async function updateProduct(
  id: string,
  updates: Partial<Product>
): Promise<Product> {
  // Strip JSONB translation columns — they don't exist in prod until the
  // ORA-2812 migration pipeline is unblocked.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name_translations, description_translations, ...rest } = updates;
  const result = await supabase()
    .from("products")
    .update(rest)
    .eq("id", id)
    .select()
    .single();
  return mapProduct(requireRow(result, "updateProduct"));
}

export async function deleteProduct(id: string): Promise<void> {
  throwOnMutationError(await supabase().from("products").delete().eq("id", id), "deleteProduct");
}

// SCH-526 — bulk insert helpers for sevDesk import. Skips rows whose
// external_ref already exists for this company so re-imports don't duplicate.
export async function bulkCreateProducts(
  rows: Array<Omit<Product, "id" | "created_at">>,
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  const companyId = getActiveCompanyId();
  const refs = rows.map((r) => r.external_ref).filter((r): r is string => !!r);
  const existing = new Set<string>();
  if (refs.length > 0) {
    const { data } = await supabase()
      .from("products")
      .select("external_ref")
      .eq("company_id", companyId)
      .in("external_ref", refs);
    (data ?? []).forEach((r) => r.external_ref && existing.add(r.external_ref));
  }
  const toInsert = rows.filter((r) => !r.external_ref || !existing.has(r.external_ref));
  if (toInsert.length === 0) return { inserted: 0, skipped: rows.length };
  const { error } = await supabase()
    .from("products")
    .insert(toInsert.map((r) => ({ ...r, company_id: companyId })));
  if (error) throw new Error(`bulkCreateProducts failed: ${error.message}`);
  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
}

export async function bulkCreateCustomers(
  rows: Array<Omit<Customer, "id" | "created_at">>,
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  const companyId = getActiveCompanyId();
  const refs = rows.map((r) => r.external_ref).filter((r): r is string => !!r);
  const existing = new Set<string>();
  if (refs.length > 0) {
    const { data } = await supabase()
      .from("customers")
      .select("external_ref")
      .eq("company_id", companyId)
      .in("external_ref", refs);
    (data ?? []).forEach((r) => r.external_ref && existing.add(r.external_ref));
  }
  const toInsert = rows.filter((r) => !r.external_ref || !existing.has(r.external_ref));
  if (toInsert.length === 0) return { inserted: 0, skipped: rows.length };
  const { error } = await supabase()
    .from("customers")
    .insert(toInsert.map((r) => ({ ...r, company_id: companyId })));
  if (error) throw new Error(`bulkCreateCustomers failed: ${error.message}`);
  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
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
  // SCH-959 — prefer the source_quote_id FK; fall back to the legacy
  // [source_quote:<uuid>] notes marker so any pre-migration row still surfaces
  // even if the backfill missed it.
  const { data: invoices } = await supabase()
    .from("invoices")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .or(`source_quote_id.eq.${quoteId},notes.ilike.%[source_quote:${quoteId}]%`)
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
  try {
    await updateSettings({ next_invoice_number: num + 1 });
  } catch (e) {
    throw new Error(
      `Rechnungsnummer konnte nicht reserviert werden: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return number;
}

export async function createInvoice(
  invoice: Omit<Invoice, "id" | "created_at" | "invoice_number">
): Promise<Invoice> {
  const invoiceNumber = await generateInvoiceNumber();
  const { items, ...invoiceData } = invoice;

  const inv = requireRow<Record<string, unknown>>(
    await supabase()
      .from("invoices")
      .insert({
        ...invoiceData,
        invoice_number: invoiceNumber,
        company_id: getActiveCompanyId(),
      })
      .select()
      .single(),
    "createInvoice",
  );

  if (items.length > 0) {
    const headerTaxRate = Number(inv.tax_rate ?? 20);
    throwOnMutationError(
      await supabase()
        .from("invoice_items")
        .insert(
          items.map((item) => ({
            invoice_id: inv.id,
            company_id: getActiveCompanyId(),
            position: item.position,
            description: item.description,
            unit: item.unit || "Stueck",
            product_id: item.product_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent || 0,
            discount_amount: item.discount_amount || 0,
            tax_rate: item.tax_rate ?? headerTaxRate,
            total: item.total,
          }))
        ),
      "createInvoice.items",
    );
  }

  return mapInvoice(inv, items);
}

export async function updateInvoice(
  id: string,
  data: Partial<Invoice>
): Promise<Invoice> {
  const { items, ...rest } = data;
  const inv = requireRow<Record<string, unknown>>(
    await supabase()
      .from("invoices")
      .update(rest)
      .eq("id", id)
      .select()
      .single(),
    "updateInvoice",
  );

  if (items) {
    throwOnMutationError(
      await supabase().from("invoice_items").delete().eq("invoice_id", id),
      "updateInvoice.items.delete",
    );
    if (items.length > 0) {
      const headerTaxRate = Number(inv.tax_rate ?? 20);
      throwOnMutationError(
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
              tax_rate: item.tax_rate ?? headerTaxRate,
              total: item.total,
            }))
          ),
        "updateInvoice.items.insert",
      );
    }
    return mapInvoice(inv, items);
  }

  const { data: currentItems } = await supabase()
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position", { ascending: true });

  return mapInvoice(inv, (currentItems ?? []).map(mapInvoiceItem));
}

export async function cancelInvoice(id: string): Promise<Invoice> {
  return updateInvoice(id, { status: "storniert" });
}

export async function deleteInvoice(id: string): Promise<void> {
  throwOnMutationError(await supabase().from("invoices").delete().eq("id", id), "deleteInvoice");
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

  const items = await getQuoteItems(id);
  return mapQuote(q, items);
}

// Fresh fetch of a quote's line items. Used by the invoice-edit modal to
// guarantee items are present even if the parent-passed `quote.items` array
// is stale/empty (SCH-603: modal was rendering empty after the quote-approval
// flow, reportedly because `quote_items` came through without items for RLS
// or race-condition reasons).
export async function getQuoteItems(quoteId: string): Promise<QuoteItem[]> {
  const { data: items } = await supabase()
    .from("quote_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("position", { ascending: true });
  return (items ?? []).map(mapQuoteItem);
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

  const q = requireRow<Record<string, unknown>>(
    await supabase()
      .from("quotes")
      .insert({
        ...quoteData,
        quote_number: quoteNumber,
        company_id: getActiveCompanyId(),
      })
      .select()
      .single(),
    "createQuote",
  );

  if (items.length > 0) {
    const headerTaxRate = Number(q.tax_rate ?? 20);
    throwOnMutationError(
      await supabase()
        .from("quote_items")
        .insert(
          items.map((item) => ({
            // SCH-924 K2-θ — preserve client-side ids so travel-day rows can
            // resolve their referenced items in the PDF breakdown.
            id: item.id || undefined,
            quote_id: q.id,
            company_id: getActiveCompanyId(),
            position: item.position,
            description: item.description,
            unit: item.unit || "Stueck",
            product_id: item.product_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent || 0,
            discount_amount: item.discount_amount || 0,
            tax_rate: item.tax_rate ?? headerTaxRate,
            total: item.total,
            role_id: item.role_id || null,
            item_type: item.item_type || "item",
            travel_day_config: item.travel_day_config ?? null,
          }))
        ),
      "createQuote.items",
    );
  }

  return mapQuote(q, items);
}

export async function updateQuote(
  id: string,
  data: Partial<Quote>
): Promise<Quote> {
  const { items, ...rest } = data;
  const q = requireRow<Record<string, unknown>>(
    await supabase()
      .from("quotes")
      .update(rest)
      .eq("id", id)
      .select()
      .single(),
    "updateQuote",
  );

  // SCH-921 K2-F1 — auto-create a Project when a quote transitions to
  // "accepted" so it becomes immediately bookable in the time tracker.
  // `createProjectFromQuote` is idempotent on quote_id, so calling it from
  // every accept-path (popup, list status change, convertQuoteToInvoice)
  // is safe. Failures are logged but do NOT roll back the status change —
  // the quote was successfully accepted from the user's perspective and
  // the project can be created later via the popup or API.
  if (data.status === "accepted") {
    try {
      await createProjectFromQuote(id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[SCH-921 K2-F1] Auto-create project failed:", err);
    }
  }

  if (items) {
    throwOnMutationError(
      await supabase().from("quote_items").delete().eq("quote_id", id),
      "updateQuote.items.delete",
    );
    if (items.length > 0) {
      const headerTaxRate = Number(q.tax_rate ?? 20);
      throwOnMutationError(
        await supabase()
          .from("quote_items")
          .insert(
            items.map((item) => ({
              // SCH-924 K2-θ — preserve client-side ids so travel-day
              // referenced_item_ids stay valid across saves.
              id: item.id || undefined,
              quote_id: id,
              position: item.position,
              description: item.description,
              unit: item.unit || "Stueck",
              product_id: item.product_id || null,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_percent: item.discount_percent || 0,
              discount_amount: item.discount_amount || 0,
              tax_rate: item.tax_rate ?? headerTaxRate,
              total: item.total,
              role_id: item.role_id || null,
              item_type: item.item_type || "item",
              travel_day_config: item.travel_day_config ?? null,
            }))
          ),
        "updateQuote.items.insert",
      );
    }
    return mapQuote(q, items);
  }

  const { data: currentItems } = await supabase()
    .from("quote_items")
    .select("*")
    .eq("quote_id", id)
    .order("position", { ascending: true });

  return mapQuote(q, (currentItems ?? []).map(mapQuoteItem));
}

export async function deleteQuote(id: string): Promise<void> {
  throwOnMutationError(await supabase().from("quotes").delete().eq("id", id), "deleteQuote");
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
    // SCH-924 K2-θ — drop section rows when converting to an invoice; they
    // are heading-only and have no price. Travel-day rows carry a pre-
    // computed unit_price so they convert cleanly as normal priced lines.
    items: quote.items
      .filter((item) => item.item_type !== "section")
      .map((item, idx) => ({
        id: crypto.randomUUID(),
        position: idx + 1,
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
    source_quote_id: quote.id,
    percent_of_quote: 100,
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
  const { data, error } = await supabase().from("expense_reports").insert({ ...report, company_id: getActiveCompanyId() }).select().single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Insert returned no row");
  return data as unknown as ExpenseReport;
}

export async function updateExpenseReport(id: string, updates: Partial<ExpenseReport>): Promise<void> {
  throwOnMutationError(await supabase().from("expense_reports").update(updates).eq("id", id), "updateExpenseReport");
}

export async function deleteExpenseReport(id: string): Promise<void> {
  throwOnMutationError(
    await supabase().from("expense_items").delete().eq("expense_report_id", id),
    "deleteExpenseReport.items",
  );
  throwOnMutationError(
    await supabase().from("expense_reports").delete().eq("id", id),
    "deleteExpenseReport",
  );
}

// Expense Items
export async function getExpenseItems(): Promise<ExpenseItem[]> {
  const { data } = await supabase().from("expense_items").select("*").eq("company_id", getActiveCompanyId()).order("date", { ascending: true });
  return (data ?? []).map((i) => ({ ...i, id: i.id as string } as ExpenseItem));
}

export async function createExpenseItem(item: Omit<ExpenseItem, "id" | "created_at">): Promise<ExpenseItem> {
  const { data, error } = await supabase().from("expense_items").insert({ ...item, company_id: getActiveCompanyId() }).select().single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Insert returned no row");
  return data as unknown as ExpenseItem;
}

export async function updateExpenseItem(id: string, updates: Partial<ExpenseItem>): Promise<void> {
  throwOnMutationError(await supabase().from("expense_items").update(updates).eq("id", id), "updateExpenseItem");
}

export async function deleteExpenseItem(id: string): Promise<void> {
  const { data } = await supabase().from("expense_items").select("receipt_file_path").eq("id", id).single();
  if (data?.receipt_file_path) {
    await supabase().storage.from("receipts").remove([data.receipt_file_path]);
  }
  throwOnMutationError(await supabase().from("expense_items").delete().eq("id", id), "deleteExpenseItem");
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

// SCH-2088 — Compute surcharge columns for a (user, start, end) tuple. Reads
// the user's weekly schedule once, runs the pure engine, returns the column
// set to merge into the insert/update payload. Returns zero-columns when the
// entry is an active timer (no end_time) or a pause row.
async function buildSurchargeColumns(
  userId: string,
  startTime: string,
  endTime: string | null | undefined,
  entryType: TimeEntryType,
): Promise<Partial<TimeEntry>> {
  if (!endTime || entryType !== "work") {
    const zero = zeroSurchargeColumns();
    return {
      surcharge_breakdown: zero.surcharge_breakdown as unknown as Record<string, unknown>,
      base_minutes: zero.base_minutes,
      ot_25_minutes: zero.ot_25_minutes,
      ot_50_minutes: zero.ot_50_minutes,
      ot_100_minutes: zero.ot_100_minutes,
    };
  }
  const schedules = await getUserWorkSchedules(userId);
  const cols = computeSurchargeColumns(startTime, endTime, schedules);
  return {
    surcharge_breakdown: cols.surcharge_breakdown as unknown as Record<string, unknown>,
    base_minutes: cols.base_minutes,
    ot_25_minutes: cols.ot_25_minutes,
    ot_50_minutes: cols.ot_50_minutes,
    ot_100_minutes: cols.ot_100_minutes,
  };
}

export async function createTimeEntry(entry: Omit<TimeEntry, "id" | "created_at">): Promise<TimeEntry> {
  const surcharge = await buildSurchargeColumns(entry.user_id, entry.start_time, entry.end_time, entry.entry_type);
  const payload = { ...entry, ...surcharge, company_id: getActiveCompanyId() };
  const result = await supabase().from("time_entries").insert(payload).select().single();
  return requireRow(result, "createTimeEntry") as unknown as TimeEntry;
}

export async function updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<void> {
  // Recompute surcharges when fields the engine depends on change. Touching
  // description/billable/etc. skips the lookup entirely so noisy edits stay
  // cheap.
  const touchesEngineInputs =
    updates.start_time !== undefined ||
    updates.end_time !== undefined ||
    updates.entry_type !== undefined;
  let merged: Partial<TimeEntry> = updates;
  if (touchesEngineInputs) {
    const { data: existing } = await supabase()
      .from("time_entries")
      .select("user_id, start_time, end_time, entry_type")
      .eq("id", id)
      .single();
    if (existing) {
      const userId = updates.user_id ?? existing.user_id;
      const startTime = updates.start_time ?? existing.start_time;
      const endTime = updates.end_time !== undefined ? updates.end_time : existing.end_time;
      const entryType = (updates.entry_type ?? existing.entry_type) as TimeEntryType;
      const surcharge = await buildSurchargeColumns(userId, startTime, endTime, entryType);
      merged = { ...updates, ...surcharge };
    }
  }
  throwOnMutationError(await supabase().from("time_entries").update(merged).eq("id", id), "updateTimeEntry");
}

export async function deleteTimeEntry(id: string): Promise<void> {
  throwOnMutationError(await supabase().from("time_entries").delete().eq("id", id), "deleteTimeEntry");
}

// Work Time Models (SCH-2087 — wiederverwendbare Arbeitszeitmodell-Vorlagen)
//
// Replaces the per-user user_work_schedules layer for reads/writes. The legacy
// table is preserved for history but is no longer the source of truth — all
// schedule data now lives in work_time_model_days, joined via
// user_profiles.work_time_model_id.

export async function getWorkTimeModels(): Promise<WorkTimeModel[]> {
  // ORA-2320 audit — propagate Supabase errors instead of swallowing them.
  // RLS denial still returns `data: []` with `error: null` (active_company_id
  // policy), so empty list is indistinguishable from "no models"; but DB-level
  // failures must surface to the caller.
  const { data, error } = await supabase()
    .from("work_time_models")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapWorkTimeModel);
}

export async function getWorkTimeModel(modelId: string): Promise<WorkTimeModel | null> {
  const { data } = await supabase()
    .from("work_time_models")
    .select("*")
    .eq("id", modelId)
    .maybeSingle();
  return data ? mapWorkTimeModel(data) : null;
}

export async function createWorkTimeModel(
  input: Omit<WorkTimeModel, "id" | "company_id" | "created_at" | "updated_at">,
): Promise<WorkTimeModel> {
  const result = await supabase()
    .from("work_time_models")
    .insert({ ...input, company_id: getActiveCompanyId() })
    .select()
    .single();
  return mapWorkTimeModel(requireRow(result, "createWorkTimeModel"));
}

export async function updateWorkTimeModel(
  modelId: string,
  patch: Partial<Omit<WorkTimeModel, "id" | "company_id" | "created_at" | "updated_at">>,
): Promise<WorkTimeModel> {
  const result = await supabase()
    .from("work_time_models")
    .update(patch)
    .eq("id", modelId)
    .select()
    .single();
  return mapWorkTimeModel(requireRow(result, "updateWorkTimeModel"));
}

export async function deleteWorkTimeModel(modelId: string): Promise<void> {
  throwOnMutationError(
    await supabase().from("work_time_models").delete().eq("id", modelId),
    "deleteWorkTimeModel",
  );
}

// ORA-2320 — read via service-role API instead of the anon-key client. The
// previous direct supabase().from("work_time_model_days") query silently
// dropped errors, so an RLS denial returned `[]` and the edit form fell back
// to the Mo-Fr 09:00-17:30 default on every reload (diagnosis: ORA-2301).
// Failures now surface so the caller can show a real error instead of
// pretending the save was empty.
export async function getWorkTimeModelDays(modelId: string): Promise<WorkTimeModelDay[]> {
  const res = await fetch(
    `/api/admin/work-time-models/${encodeURIComponent(modelId)}/days`,
    { method: "GET", headers: { "Content-Type": "application/json" }, cache: "no-store" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Arbeitszeitmodell-Tage laden fehlgeschlagen (${res.status})`);
  }
  const body = (await res.json()) as { days?: unknown };
  const rows = Array.isArray(body.days) ? body.days : [];
  return rows.map((r) => mapWorkTimeModelDay(r as Record<string, unknown>));
}

// Replace the per-weekday rows for a model in one shot. Empty rows (no Von/Bis
// and 0 Tagespensum) are deleted; valid rows are upserted; the parent model's
// weekly_target_minutes is recomputed so the list view stays in sync.
export async function replaceWorkTimeModelDays(
  modelId: string,
  rows: Array<Omit<WorkTimeModelDay, "model_id">>,
): Promise<WorkTimeModelDay[]> {
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
      throw new Error(`Ungültiges Modell für Wochentag ${i}: ${errs.join(", ")}`);
    }
    kept.push(row);
  }

  const sb = supabase();

  if (removedWeekdays.length > 0) {
    await sb
      .from("work_time_model_days")
      .delete()
      .eq("model_id", modelId)
      .in("weekday", removedWeekdays);
  }

  let saved: WorkTimeModelDay[] = [];
  if (kept.length > 0) {
    const { data, error } = await sb
      .from("work_time_model_days")
      .upsert(
        kept.map((r) => ({ ...r, model_id: modelId })),
        { onConflict: "model_id,weekday" },
      )
      .select();
    if (error) throw new Error(error.message);
    saved = (data ?? []).map(mapWorkTimeModelDay);
  }

  const weeklyTotal = saved.reduce((s, r) => s + r.daily_target_minutes, 0);
  await sb
    .from("work_time_models")
    .update({ weekly_target_minutes: weeklyTotal })
    .eq("id", modelId);

  return saved;
}

export async function assignWorkTimeModelToUser(
  userProfileId: string,
  modelId: string | null,
): Promise<void> {
  throwOnMutationError(
    await supabase()
      .from("user_profiles")
      .update({ work_time_model_id: modelId })
      .eq("id", userProfileId),
    "assignWorkTimeModelToUser",
  );
}

// Users currently using a given model (used by the admin list to show the
// "x MA zugewiesen" badge and the model-detail page to show the assignment).
export async function getUsersAssignedToWorkTimeModel(modelId: string): Promise<UserProfile[]> {
  // ORA-2320 audit — propagate Supabase errors instead of swallowing them.
  const { data, error } = await supabase()
    .from("user_profiles")
    .select("*")
    .eq("work_time_model_id", modelId)
    .order("display_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapUserProfile);
}

// User Work Schedules (per-user weekly pensum — SCH-369; re-routed via models
// in SCH-2087). The read path joins user_profiles.work_time_model_id ➜
// work_time_model_days so existing callers (TimeCalendarView, smart-insights,
// work-schedule helpers) keep their input shape. The legacy
// user_work_schedules table is no longer queried.
export async function getUserWorkSchedules(userId: string): Promise<UserWorkSchedule[]> {
  const sb = supabase();
  const { data: profileRow } = await sb
    .from("user_profiles")
    .select("work_time_model_id")
    .eq("id", userId)
    .maybeSingle();

  const modelId = (profileRow?.work_time_model_id as string | null) ?? null;
  if (!modelId) return [];

  const { data: modelRow } = await sb
    .from("work_time_models")
    .select("unpaid_break_minutes, created_at, updated_at")
    .eq("id", modelId)
    .maybeSingle();

  const { data: dayRows } = await sb
    .from("work_time_model_days")
    .select("*")
    .eq("model_id", modelId)
    .order("weekday", { ascending: true });

  const breakMin = Number(modelRow?.unpaid_break_minutes ?? 0);
  const createdAt = (modelRow?.created_at as string) ?? new Date(0).toISOString();
  const updatedAt = (modelRow?.updated_at as string) ?? new Date(0).toISOString();

  return (dayRows ?? []).map((r) =>
    synthesizeUserWorkSchedule(r as Record<string, unknown>, {
      userId,
      modelId,
      unpaidBreakMinutes: breakMin,
      createdAt,
      updatedAt,
    }),
  );
}

export async function getCurrentUserWorkSchedules(): Promise<UserWorkSchedule[]> {
  const { data: { user } } = await supabase().auth.getUser();
  if (!user) return [];
  const profile = await getUserProfile(user.id);
  if (!profile) return [];
  return getUserWorkSchedules(profile.id);
}

// Replace the user's schedule. If the user has no assigned model yet, create a
// "Persönliches Modell – {display_name}" first so subsequent reads find it.
// Defensive: if the assigned model is shared (used by another user), we still
// edit it in place — admin UI should warn before calling this in that case.
export async function replaceUserWorkSchedules(
  userId: string,
  rows: Array<
    Omit<UserWorkSchedule, "id" | "user_id" | "created_at" | "updated_at" | "unpaid_break_minutes">
    & { unpaid_break_minutes?: number }
  >,
): Promise<UserWorkSchedule[]> {
  const sb = supabase();
  const { data: profileRow } = await sb
    .from("user_profiles")
    .select("id, display_name, work_time_model_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profileRow) throw new Error("Mitarbeiter nicht gefunden");

  let modelId = (profileRow.work_time_model_id as string | null) ?? null;
  if (!modelId) {
    const created = await createWorkTimeModel({
      name: `Persönliches Modell – ${(profileRow.display_name as string) || "Mitarbeiter"}`,
      weekly_target_minutes: 0,
      unpaid_break_minutes: 30,
      vacation_days_per_year: 25,
    });
    modelId = created.id;
    await assignWorkTimeModelToUser(userId, modelId);
  }

  // If any per-day Pause came in, lift the largest value into the model so the
  // derivedTarget helper in the editor stays in sync after save.
  const breaks = rows
    .map((r) => Number(r.unpaid_break_minutes ?? 0))
    .filter((n) => n > 0);
  if (breaks.length > 0) {
    const maxBreak = Math.max(...breaks);
    await updateWorkTimeModel(modelId, { unpaid_break_minutes: maxBreak });
  }

  const dayRows = rows.map((r) => ({
    weekday: r.weekday,
    start_time: r.start_time,
    end_time: r.end_time,
    daily_target_minutes: r.daily_target_minutes,
  }));
  await replaceWorkTimeModelDays(modelId, dayRows);

  return getUserWorkSchedules(userId);
}

// Absences + Leave Balances (SCH-925 K2-ι) ---------------------------------
export async function getAbsences(userId?: string): Promise<Absence[]> {
  let query = supabase()
    .from("absences")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .order("starts_on", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query;
  return (data ?? []).map(mapAbsence);
}

export async function createAbsence(
  absence: Omit<Absence, "id" | "company_id" | "created_at" | "updated_at">
): Promise<Absence> {
  const result = await supabase()
    .from("absences")
    .insert({ ...absence, company_id: getActiveCompanyId() })
    .select()
    .single();
  return mapAbsence(requireRow(result, "createAbsence"));
}

export async function updateAbsence(
  id: string,
  updates: Partial<Omit<Absence, "id" | "company_id" | "created_at" | "updated_at">>
): Promise<Absence> {
  const result = await supabase()
    .from("absences")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return mapAbsence(requireRow(result, "updateAbsence"));
}

export async function deleteAbsence(id: string): Promise<void> {
  throwOnMutationError(await supabase().from("absences").delete().eq("id", id), "deleteAbsence");
}

export async function getLeaveBalances(year?: number): Promise<UserLeaveBalance[]> {
  let query = supabase()
    .from("user_leave_balances")
    .select("*")
    .eq("company_id", getActiveCompanyId());
  if (year !== undefined) query = query.eq("year", year);
  const { data } = await query;
  return (data ?? []).map(mapUserLeaveBalance);
}

export async function getUserLeaveBalance(
  userId: string,
  year: number
): Promise<UserLeaveBalance | null> {
  const { data } = await supabase()
    .from("user_leave_balances")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .eq("user_id", userId)
    .eq("year", year)
    .maybeSingle();
  return data ? mapUserLeaveBalance(data) : null;
}

export async function upsertLeaveBalance(
  balance: Omit<UserLeaveBalance, "id" | "company_id" | "created_at" | "updated_at">
): Promise<UserLeaveBalance> {
  const result = await supabase()
    .from("user_leave_balances")
    .upsert(
      { ...balance, company_id: getActiveCompanyId() },
      { onConflict: "user_id,year" }
    )
    .select()
    .single();
  return mapUserLeaveBalance(requireRow(result, "upsertLeaveBalance"));
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
  const result = await supabase()
    .from("projects")
    .insert({ ...project, company_id: getActiveCompanyId() })
    .select()
    .single();
  return mapProject(requireRow(result, "createProject"));
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const result = await supabase()
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return mapProject(requireRow(result, "updateProject"));
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
  const result = await supabase()
    .from("tasks")
    .insert({ ...task, company_id: getActiveCompanyId() })
    .select()
    .single();
  return mapTask(requireRow(result, "createTask"));
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const result = await supabase()
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return mapTask(requireRow(result, "updateTask"));
}

export async function deleteTask(id: string): Promise<void> {
  await supabase().from("tasks").delete().eq("id", id);
}

// SCH-921 K2-E1 — Cumulative logged minutes per project for the active
// company. Used by the budget-overshoot smart insight so it compares the
// project's full lifetime against `projects.budget_hours`, not just the
// current week. Aggregates client-side off a single SELECT to keep the
// number of round-trips down; per-row cost is fine for a normal company
// (usually a few thousand entries at most).
export async function getProjectLoggedMinutes(): Promise<Map<string, number>> {
  const { data, error } = await supabase()
    .from("time_entries")
    .select("project_id, duration_minutes")
    .eq("company_id", getActiveCompanyId())
    .eq("entry_type", "work")
    .not("project_id", "is", null);
  if (error) throw new Error(error.message);
  const totals = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ project_id: string | null; duration_minutes: number | null }>) {
    if (!row.project_id) continue;
    totals.set(row.project_id, (totals.get(row.project_id) ?? 0) + (Number(row.duration_minutes) || 0));
  }
  return totals;
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
  const result = await supabase()
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
  return mapUserDashboardLayout(requireRow(result, "upsertUserDashboardLayout"));
}

export async function deleteUserDashboardLayout(
  userId: string,
  dashboardKey: string = DEFAULT_DASHBOARD_KEY
): Promise<void> {
  throwOnMutationError(
    await supabase()
      .from("user_dashboard_layouts")
      .delete()
      .eq("company_id", getActiveCompanyId())
      .eq("user_id", userId)
      .eq("dashboard_key", dashboardKey),
    "deleteUserDashboardLayout",
  );
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
  const result = await supabase()
    .from("company_roles")
    .insert({ ...role, company_id: getActiveCompanyId() })
    .select()
    .single();
  return mapCompanyRole(requireRow(result, "createCompanyRole"));
}

export async function updateCompanyRole(
  id: string,
  updates: Partial<Pick<CompanyRole, "name" | "description" | "color">>
): Promise<CompanyRole> {
  const result = await supabase()
    .from("company_roles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", getActiveCompanyId())
    .select()
    .single();
  return mapCompanyRole(requireRow(result, "updateCompanyRole"));
}

export async function deleteCompanyRole(id: string): Promise<void> {
  throwOnMutationError(
    await supabase()
      .from("company_roles")
      .delete()
      .eq("id", id)
      .eq("company_id", getActiveCompanyId()),
    "deleteCompanyRole",
  );
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
  const result = await supabase()
    .from("user_role_assignments")
    .upsert(
      { company_id: getActiveCompanyId(), user_id: userId, role_id: roleId },
      { onConflict: "user_id,role_id" }
    )
    .select()
    .single();
  return mapUserRoleAssignment(requireRow(result, "assignRoleToUser"));
}

export async function removeRoleFromUser(
  userId: string,
  roleId: string
): Promise<void> {
  throwOnMutationError(
    await supabase()
      .from("user_role_assignments")
      .delete()
      .eq("user_id", userId)
      .eq("role_id", roleId),
    "removeRoleFromUser",
  );
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

// General Categories (SCH-921 K2-J1 — Admin-managed Allgemein/Sonstiges labels)

export async function getGeneralCategories(): Promise<GeneralCategory[]> {
  const { data } = await supabase()
    .from("general_categories")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .order("group_key")
    .order("sort_order")
    .order("label");
  const rows = (data ?? []).map(mapGeneralCategory);
  // Fall back to the hardcoded defaults if the company has no rows yet —
  // keeps the modal usable on legacy tenants that haven't been seeded by
  // the SCH-921 migration.
  if (rows.length === 0) {
    return DEFAULT_GENERAL_CATEGORIES.map((c, i) => ({
      id: `default:${c.group_key}:${c.label}`,
      company_id: getActiveCompanyId(),
      label: c.label,
      group_key: c.group_key,
      sort_order: (i + 1) * 10,
      created_at: "",
      updated_at: "",
    }));
  }
  return rows;
}

export async function createGeneralCategory(
  input: { label: string; group_key: GeneralCategoryGroup; sort_order?: number },
): Promise<GeneralCategory> {
  const result = await supabase()
    .from("general_categories")
    .insert({
      company_id: getActiveCompanyId(),
      label: input.label.trim(),
      group_key: input.group_key,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();
  return mapGeneralCategory(requireRow(result, "createGeneralCategory"));
}

export async function updateGeneralCategory(
  id: string,
  updates: Partial<Pick<GeneralCategory, "label" | "group_key" | "sort_order">>,
): Promise<GeneralCategory> {
  const patch: Record<string, unknown> = { ...updates };
  if (typeof updates.label === "string") patch.label = updates.label.trim();
  const result = await supabase()
    .from("general_categories")
    .update(patch)
    .eq("id", id)
    .eq("company_id", getActiveCompanyId())
    .select()
    .single();
  return mapGeneralCategory(requireRow(result, "updateGeneralCategory"));
}

export async function deleteGeneralCategory(id: string): Promise<void> {
  throwOnMutationError(
    await supabase()
      .from("general_categories")
      .delete()
      .eq("id", id)
      .eq("company_id", getActiveCompanyId()),
    "deleteGeneralCategory",
  );
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
  const result = await supabase()
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
  return mapSmartInsightsConfig(requireRow(result, "upsertSmartInsightsConfig"));
}

// Bank Statements
export async function getBankStatements(): Promise<BankStatement[]> {
  const { data } = await supabase().from("bank_statements").select("*").eq("company_id", getActiveCompanyId()).order("created_at", { ascending: false });
  return (data ?? []).map(mapBankStatement);
}

export async function createBankStatement(stmt: Omit<BankStatement, "id" | "created_at" | "updated_at">): Promise<BankStatement> {
  const result = await supabase().from("bank_statements").insert({ ...stmt, company_id: getActiveCompanyId() }).select().single();
  return mapBankStatement(requireRow(result, "createBankStatement"));
}

export async function deleteBankStatement(id: string): Promise<void> {
  throwOnMutationError(
    await supabase().from("bank_transactions").delete().eq("statement_id", id),
    "deleteBankStatement.transactions",
  );
  throwOnMutationError(
    await supabase().from("bank_statements").delete().eq("id", id),
    "deleteBankStatement",
  );
}

export async function getTransactions(statementId?: string): Promise<BankTransaction[]> {
  let query = supabase().from("bank_transactions").select("*").eq("company_id", getActiveCompanyId()).order("booking_date", { ascending: false });
  if (statementId) query = query.eq("statement_id", statementId);
  const { data } = await query;
  return (data ?? []).map(mapBankTransaction);
}

export async function createTransaction(tx: Omit<BankTransaction, "id" | "created_at" | "updated_at">): Promise<BankTransaction> {
  const result = await supabase().from("bank_transactions").insert({ ...tx, company_id: getActiveCompanyId() }).select().single();
  return mapBankTransaction(requireRow(result, "createTransaction"));
}

export async function updateTransaction(id: string, updates: Partial<BankTransaction>): Promise<BankTransaction> {
  const result = await supabase().from("bank_transactions").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  return mapBankTransaction(requireRow(result, "updateTransaction"));
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
  const result = await supabase().from("receipts").insert({ ...receipt, company_id: getActiveCompanyId() }).select().single();
  return mapReceipt(requireRow(result, "createReceipt"));
}

export async function updateReceipt(id: string, updates: Partial<Receipt>): Promise<Receipt> {
  const result = await supabase().from("receipts").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  return mapReceipt(requireRow(result, "updateReceipt"));
}

export async function deleteReceipt(id: string): Promise<void> {
  const receipt = await getReceipt(id);
  if (receipt) {
    await supabase().storage.from("receipts").remove([receipt.file_path]);
  }
  throwOnMutationError(await supabase().from("receipts").delete().eq("id", id), "deleteReceipt");
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
  const result = await supabase()
    .from("templates")
    .insert({ ...template, items: JSON.stringify(template.items), company_id: getActiveCompanyId() })
    .select()
    .single();
  return mapTemplate(requireRow(result, "createTemplate"));
}

export async function deleteTemplate(id: string): Promise<void> {
  throwOnMutationError(await supabase().from("templates").delete().eq("id", id), "deleteTemplate");
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
  const result = await supabase()
    .from("fixed_costs")
    .insert({ ...cost, company_id: getActiveCompanyId() })
    .select()
    .single();
  return mapFixedCost(requireRow(result, "createFixedCost"));
}

export async function updateFixedCost(
  id: string,
  updates: Partial<FixedCost>
): Promise<FixedCost> {
  const result = await supabase()
    .from("fixed_costs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  return mapFixedCost(requireRow(result, "updateFixedCost"));
}

export async function deleteFixedCost(id: string): Promise<void> {
  throwOnMutationError(await supabase().from("fixed_costs").delete().eq("id", id), "deleteFixedCost");
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
    external_ref: (row.external_ref as string) || "",
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
    external_ref: (row.external_ref as string) || "",
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
    tax_rate: row.tax_rate === null || row.tax_rate === undefined ? undefined : Number(row.tax_rate),
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
    source_quote_id: (row.source_quote_id as string) ?? null,
    percent_of_quote: row.percent_of_quote == null ? null : Number(row.percent_of_quote),
  };
}

function mapQuoteItem(row: Record<string, unknown>): QuoteItem {
  const itemType = (row.item_type as string) || "item";
  const travelCfg = row.travel_day_config;
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
    tax_rate: row.tax_rate === null || row.tax_rate === undefined ? undefined : Number(row.tax_rate),
    total: Number(row.total),
    role_id: (row.role_id as string) || null,
    item_type: (itemType === "section" || itemType === "travel_day" || itemType === "item")
      ? (itemType as QuoteItem["item_type"])
      : "item",
    travel_day_config: travelCfg
      ? (travelCfg as QuoteItem["travel_day_config"])
      : null,
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
    buyouts: (row.buyouts as string) || null,
    exports_and_delivery: (row.exports_and_delivery as string) || null,
    assumptions: (row.assumptions as string) || null,
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
    is_billable: row.is_billable == null ? true : Boolean(row.is_billable),
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

function mapGeneralCategory(row: Record<string, unknown>): GeneralCategory {
  const group = row.group_key === "sonstiges" ? "sonstiges" : "allgemein";
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    label: (row.label as string) || "",
    group_key: group as GeneralCategoryGroup,
    sort_order: Number(row.sort_order ?? 0),
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

function trimTimeColumn(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  // Postgres `time` columns round-trip as "HH:MM:SS"; keep only "HH:MM".
  return v.length >= 5 ? v.slice(0, 5) : v;
}

function mapWorkTimeModel(row: Record<string, unknown>): WorkTimeModel {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    name: (row.name as string) || "",
    weekly_target_minutes: Number(row.weekly_target_minutes ?? 0),
    unpaid_break_minutes: Number(row.unpaid_break_minutes ?? 30),
    vacation_days_per_year: Number(row.vacation_days_per_year ?? 25),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapWorkTimeModelDay(row: Record<string, unknown>): WorkTimeModelDay {
  return {
    model_id: row.model_id as string,
    weekday: Number(row.weekday),
    start_time: trimTimeColumn(row.start_time),
    end_time: trimTimeColumn(row.end_time),
    daily_target_minutes: Number(row.daily_target_minutes ?? 0),
  };
}

// SCH-2087 — getUserWorkSchedules now reads from work_time_model_days. The
// legacy callers expect UserWorkSchedule rows, so we synthesize one per
// model-day using model-level metadata (unpaid break, created/updated stamps)
// and a composite id keyed by model+weekday so React keys stay stable.
function synthesizeUserWorkSchedule(
  row: Record<string, unknown>,
  ctx: { userId: string; modelId: string; unpaidBreakMinutes: number; createdAt: string; updatedAt: string },
): UserWorkSchedule {
  const weekday = Number(row.weekday);
  return {
    id: `${ctx.modelId}:${weekday}`,
    user_id: ctx.userId,
    weekday,
    start_time: trimTimeColumn(row.start_time),
    end_time: trimTimeColumn(row.end_time),
    daily_target_minutes: Number(row.daily_target_minutes ?? 0),
    unpaid_break_minutes: ctx.unpaidBreakMinutes,
    created_at: ctx.createdAt,
    updated_at: ctx.updatedAt,
  };
}

function mapAbsence(row: Record<string, unknown>): Absence {
  const kind = row.kind as string;
  const safeKind: AbsenceKind = kind === "comp_time" || kind === "sick" || kind === "other"
    ? kind
    : "vacation";
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    user_id: row.user_id as string,
    kind: safeKind,
    starts_on: (row.starts_on as string) || "",
    ends_on: (row.ends_on as string) || "",
    working_days: Number(row.working_days ?? 0),
    note: (row.note as string) || "",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapUserLeaveBalance(row: Record<string, unknown>): UserLeaveBalance {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    user_id: row.user_id as string,
    year: Number(row.year ?? new Date().getFullYear()),
    vacation_days_total: Number(row.vacation_days_total ?? 0),
    vacation_days_carried: Number(row.vacation_days_carried ?? 0),
    overtime_starting_minutes: Number(row.overtime_starting_minutes ?? 0),
    note: (row.note as string) || "",
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
    onboarding_completed_at: (row.onboarding_completed_at as string | null) ?? null,
    // SCH-2087 — column added in 20260511180000_sch2087_work_time_models.sql
    work_time_model_id: (row.work_time_model_id as string | null) ?? null,
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

  let aiPayload: QuoteDesignAIPayload | null = null;
  const rawPayload = row.ai_generated_payload;
  if (rawPayload) {
    try {
      aiPayload = typeof rawPayload === "string"
        ? (JSON.parse(rawPayload) as QuoteDesignAIPayload)
        : (rawPayload as QuoteDesignAIPayload);
    } catch { /* empty */ }
  }

  return {
    id: row.id as string,
    company_id: row.company_id as string,
    quote_id: row.quote_id as string,
    design_key: (row.design_key as QuoteDesignKey) || "classic",
    photo_ids: photoIds,
    ai_generated_payload: aiPayload,
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
  throwOnMutationError(
    await supabase().from("quote_design_photos").delete().eq("id", id),
    "deleteDesignPhoto",
  );
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
  photoIds: string[],
  aiPayload?: QuoteDesignAIPayload | null
): Promise<QuoteDesignSelection> {
  const row: Record<string, unknown> = {
    company_id: getActiveCompanyId(),
    quote_id: quoteId,
    design_key: designKey,
    photo_ids: JSON.stringify(photoIds),
    updated_at: new Date().toISOString(),
  };
  if (aiPayload !== undefined) {
    row.ai_generated_payload = aiPayload;
  }
  const result = await supabase()
    .from("quote_design_selections")
    .upsert(row, { onConflict: "quote_id" })
    .select()
    .single();
  return mapDesignSelection(requireRow(result, "upsertDesignSelection"));
}
