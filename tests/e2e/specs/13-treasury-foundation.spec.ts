// ORA-2283 — Treasury Phase 0+1 smoke suite.
//
// Covers:
//   * Sidebar visibility flips with company_subscriptions.has_treasury.
//   * Middleware returns 404 for unauthenticated /treasury access and for
//     authenticated users in a tenant where has_treasury=false.
//   * Manual CAMT.053 upload round-trips through /api/treasury/statements/upload
//     and the parsed transactions land in the user's tenant.
//   * RLS blocks a cross-tenant SELECT: a user from company A cannot read
//     treasury_statements rows belonging to company B.

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { provisionTenant, destroyTenant, type TestTenant } from "../helpers/test-tenant";
import { loginAs, logout } from "../helpers/auth";
import { buildCamt053Fixture, cleanupTreasuryFor, setTreasuryFlag } from "../helpers/treasury";
import { loadEnv } from "../helpers/env";

let tenant: TestTenant;

test.beforeAll(async () => {
  tenant = await provisionTenant();
});

test.afterAll(async () => {
  if (tenant) {
    await cleanupTreasuryFor(tenant.primarySlug);
    await cleanupTreasuryFor(tenant.secondarySlug);
    await destroyTenant(tenant);
  }
});

test("Treasury sidebar is invisible when has_treasury=false", async ({ page }) => {
  await setTreasuryFlag(tenant.primarySlug, false);
  await loginAs(page, tenant.admin);
  await expect(page.getByTestId("treasury-nav-block")).toHaveCount(0);
  await logout(page);
});

test("Treasury sidebar appears + clickable when has_treasury=true", async ({ page }) => {
  await setTreasuryFlag(tenant.primarySlug, true);
  await loginAs(page, tenant.admin);
  await expect(page.getByTestId("treasury-nav-block")).toBeVisible();
  await page.getByRole("link", { name: /treasury/i }).first().click();
  await expect(page).toHaveURL(/\/treasury(\/|$)/);
  await logout(page);
});

test("Middleware 404s /treasury when has_treasury=false", async ({ page }) => {
  await setTreasuryFlag(tenant.primarySlug, false);
  await loginAs(page, tenant.admin);
  const response = await page.goto("/treasury/cash", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(404);
  await logout(page);
});

test("Unauthenticated /treasury redirects to /login", async ({ page }) => {
  await page.context().clearCookies();
  const response = await page.goto("/treasury/cash", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/login");
  // First response is a 302 → final HTML is the login page (status 200).
  expect(response?.status()).toBeLessThan(500);
});

test("CAMT.053 upload imports a statement + transactions for the tenant", async ({ page }) => {
  await setTreasuryFlag(tenant.primarySlug, true);
  await loginAs(page, tenant.admin);

  const iban = `AT91${Date.now().toString().slice(-16).padStart(16, "0")}`;
  const xml = buildCamt053Fixture({
    iban,
    statementDate: "2026-05-16",
    opening: 10_000,
    closing: 10_083.5, // opening + 125.50 - 42.00
  });

  const response = await page.evaluate(
    async ({ body }) => {
      const r = await fetch("/api/treasury/statements/upload", {
        method: "POST",
        headers: { "content-type": "application/xml" },
        body,
      });
      return { status: r.status, body: await r.json() };
    },
    { body: xml },
  );

  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(response.body.transactions).toBe(2);

  // Verify via service-role: row exists for this tenant, none for the other.
  const env = loadEnv();
  const svc = createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ours = await svc
    .from("treasury_statements")
    .select("id, company_id")
    .eq("company_id", tenant.primarySlug);
  expect(ours.data?.length ?? 0).toBeGreaterThan(0);
  const theirs = await svc
    .from("treasury_statements")
    .select("id")
    .eq("company_id", tenant.secondarySlug);
  expect(theirs.data?.length ?? 0).toBe(0);

  await logout(page);
});

test("RLS blocks cross-tenant treasury_statements SELECT", async () => {
  // Both tenants get Treasury enabled so the policy itself (not just the
  // feature flag) does the gating work.
  await setTreasuryFlag(tenant.primarySlug, true);
  await setTreasuryFlag(tenant.secondarySlug, true);

  const env = loadEnv();
  const svc = createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Seed an entity + account + statement directly in the SECONDARY tenant.
  const entity = await svc
    .from("treasury_entities")
    .insert({ company_id: tenant.secondarySlug, legal_name: "QA B", currency: "EUR" })
    .select("id")
    .single();
  expect(entity.error, entity.error?.message).toBeNull();
  const account = await svc
    .from("treasury_bank_accounts")
    .insert({
      company_id: tenant.secondarySlug,
      entity_id: (entity.data as { id: string }).id,
      bank_bic: "TESTDEFFXXX",
      bank_name: "Cross-tenant probe",
      iban: "DE00000000000000000099",
      currency: "EUR",
      status: "active",
    })
    .select("id")
    .single();
  expect(account.error, account.error?.message).toBeNull();
  const probeHash = `cross-tenant-probe-${Date.now()}`;
  const stmt = await svc
    .from("treasury_statements")
    .insert({
      company_id: tenant.secondarySlug,
      account_id: (account.data as { id: string }).id,
      statement_date: "2026-05-15",
      opening_balance: 0,
      closing_balance: 0,
      currency: "EUR",
      raw_hash: probeHash,
      source: "manual_upload",
    })
    .select("id")
    .single();
  expect(stmt.error, stmt.error?.message).toBeNull();

  // Sign in as the PRIMARY-tenant admin via anon-key + password. This issues a
  // JWT bound to that user; the access token carries app_metadata.company_id
  // for the primary tenant. RLS must then hide the secondary-tenant row.
  const userClient = createClient(env.supabaseUrl, env.anonKey);
  const signin = await userClient.auth.signInWithPassword({
    email: tenant.admin.email,
    password: tenant.admin.password,
  });
  expect(signin.error, signin.error?.message).toBeNull();

  // RLS-bound SELECT: scoped to active_company_id from the JWT.
  const seen = await userClient
    .from("treasury_statements")
    .select("id, company_id, raw_hash");
  expect(seen.error, seen.error?.message).toBeNull();
  const rows = seen.data ?? [];
  // Must not contain the secondary-tenant probe row.
  expect(rows.find((r) => (r as { raw_hash: string }).raw_hash === probeHash)).toBeUndefined();
  for (const row of rows) {
    expect((row as { company_id: string }).company_id).toBe(tenant.primarySlug);
  }
});
