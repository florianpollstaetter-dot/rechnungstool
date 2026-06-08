// SCH-930 / ORA-2344 — Product & customer alphabet sort + search verification.
//
// The K2-λ feature is pure client-side list logic (see
// src/app/(app)/products/page.tsx:220-240 and
// src/app/(app)/customers/page.tsx:185-199):
//   - sort: Intl.Collator(locale, { sensitivity: "base", numeric: true })
//     → A→Z, case- AND diacritic-insensitive, locale-aware (de).
//       Products sort by `name`; customers by `company || name`.
//   - search: searchQuery.trim().toLowerCase() substring match → case-insensitive.
//
// To prove the UI does the sorting itself we seed rows DELIBERATELY out of
// alphabetical order and with mixed leading case, then assert the rendered
// first-column order is A→Z. Search cases use a different case than the seed
// to prove case-insensitivity.
//
// Fixture: provisionTenant() gives a fresh qa-perms tenant whose admin holds
// FULL_PERMS (produkte + kunden), so the nav + pages render. We seed via the
// service-role client (same path as 16-cross-tenant-isolation) and tear down
// in afterAll.

import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "../helpers/env";
import { provisionTenant, destroyTenant, type TestTenant } from "../helpers/test-tenant";
import { loginAs } from "../helpers/auth";

let tenant: TestTenant;

function svc(): SupabaseClient {
  const env = loadEnv();
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Seeded out of order + mixed leading case. Expected display order is the
// case-insensitive locale A→Z below.
const PRODUCT_NAMES = ["Zebra Widget", "apfel Geraet", "Mango Werkzeug", "banane Set"];
const EXPECTED_PRODUCT_ORDER = ["apfel Geraet", "banane Set", "Mango Werkzeug", "Zebra Widget"];

// Customers seeded with empty company so both the sort key (`company || name`)
// and the rendered first cell (`company || name`) resolve to `name`.
const CUSTOMER_NAMES = ["Yvonne Ziegler", "anton Bauer", "Markus Huber", "Bernd Acker"];
const EXPECTED_CUSTOMER_ORDER = ["anton Bauer", "Bernd Acker", "Markus Huber", "Yvonne Ziegler"];

const PRODUCTS_SEARCH = "Suche nach Name oder Beschreibung...";
const CUSTOMERS_SEARCH = "Suche nach Name, Unternehmen, UID, E-Mail...";
const NAME_CELL = "tbody tr td:first-child .font-medium";

async function seedProducts(companyId: string): Promise<void> {
  const rows = PRODUCT_NAMES.map((name) => ({
    company_id: companyId,
    name,
    description: "",
    name_en: "",
    description_en: "",
    name_translations: {},
    description_translations: {},
    unit: "Stueck",
    unit_price: 100,
    tax_rate: 20,
    active: true,
    role_id: null,
  }));
  const { error } = await svc().from("products").insert(rows);
  if (error) throw new Error(`seedProducts failed: ${error.message}`);
}

async function seedCustomers(companyId: string, runId: string): Promise<void> {
  const rows = CUSTOMER_NAMES.map((name, i) => ({
    company_id: companyId,
    name,
    company: "",
    address: "Teststrasse 1",
    city: "Wien",
    zip: "1010",
    country: "AT",
    uid_number: "",
    email: `seed-${runId}-${i}@example.test`,
    phone: "",
    leitweg_id: "",
  }));
  const { error } = await svc().from("customers").insert(rows);
  if (error) throw new Error(`seedCustomers failed: ${error.message}`);
}

async function renderedNames(page: Page): Promise<string[]> {
  return (await page.locator(NAME_CELL).allTextContents()).map((s) => s.trim());
}

test.beforeAll(async () => {
  tenant = await provisionTenant();
  await seedProducts(tenant.primarySlug);
  await seedCustomers(tenant.primarySlug, tenant.runId);
});

test.afterAll(async () => {
  const s = svc();
  await s.from("products").delete().eq("company_id", tenant.primarySlug).then(() => undefined, () => undefined);
  await s.from("customers").delete().eq("company_id", tenant.primarySlug).then(() => undefined, () => undefined);
  await destroyTenant(tenant).catch(() => undefined);
});

test.describe("SCH-930 — products list sort + search", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, tenant.admin);
    await page.goto("/products");
    await expect(page.locator(NAME_CELL).first()).toBeVisible();
  });

  test("products render alphabetically A→Z (case-insensitive, locale-aware)", async ({ page }) => {
    expect(await renderedNames(page)).toEqual(EXPECTED_PRODUCT_ORDER);
  });

  test("products search filters by name", async ({ page }) => {
    await page.getByPlaceholder(PRODUCTS_SEARCH).fill("Mango");
    await expect.poll(() => renderedNames(page)).toEqual(["Mango Werkzeug"]);
  });

  test("products search is case-insensitive", async ({ page }) => {
    // Seed name is "Mango Werkzeug"; query lowercase must still match.
    await page.getByPlaceholder(PRODUCTS_SEARCH).fill("mango");
    await expect.poll(() => renderedNames(page)).toEqual(["Mango Werkzeug"]);
  });

  test("clearing products search restores the full sorted list", async ({ page }) => {
    const box = page.getByPlaceholder(PRODUCTS_SEARCH);
    await box.fill("mango");
    await expect.poll(() => renderedNames(page)).toEqual(["Mango Werkzeug"]);
    await box.fill("");
    await expect.poll(() => renderedNames(page)).toEqual(EXPECTED_PRODUCT_ORDER);
  });
});

test.describe("SCH-930 — customers list sort + search", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, tenant.admin);
    await page.goto("/customers");
    await expect(page.locator(NAME_CELL).first()).toBeVisible();
  });

  test("customers render alphabetically A→Z (case-insensitive, locale-aware)", async ({ page }) => {
    expect(await renderedNames(page)).toEqual(EXPECTED_CUSTOMER_ORDER);
  });

  test("customers search filters by name", async ({ page }) => {
    await page.getByPlaceholder(CUSTOMERS_SEARCH).fill("Markus");
    await expect.poll(() => renderedNames(page)).toEqual(["Markus Huber"]);
  });

  test("customers search is case-insensitive", async ({ page }) => {
    // Seed name is "Markus Huber"; uppercase query must still match.
    await page.getByPlaceholder(CUSTOMERS_SEARCH).fill("MARKUS");
    await expect.poll(() => renderedNames(page)).toEqual(["Markus Huber"]);
  });

  test("clearing customers search restores the full sorted list", async ({ page }) => {
    const box = page.getByPlaceholder(CUSTOMERS_SEARCH);
    await box.fill("MARKUS");
    await expect.poll(() => renderedNames(page)).toEqual(["Markus Huber"]);
    await box.fill("");
    await expect.poll(() => renderedNames(page)).toEqual(EXPECTED_CUSTOMER_ORDER);
  });
});
