// SCH-976 spec 2 — K3 dashboard refinement of K2-G4 (commit 2f306ca).
//
// Dashboard cards + recent panels + quick-action buttons are gated by the
// same `canSee()` permission check as the sidebar. qa-empty sees an empty
// dashboard heading; qa-rechn-only sees only the rechnungen-flavoured
// surfaces; qa-admin sees the full set.

import { expect, test } from "@playwright/test";
import { provisionTenant, destroyTenant, type TestTenant } from "../helpers/test-tenant";
import { loginAs, logout } from "../helpers/auth";

let tenant: TestTenant;

test.beforeAll(async () => {
  tenant = await provisionTenant();
});

test.afterAll(async () => {
  if (tenant) await destroyTenant(tenant);
});

async function gotoDashboard(page: import("@playwright/test").Page) {
  await page.goto("/dashboard");
  await page.locator("h1").first().waitFor();
}

test("qa-empty: no KPI cards, no recent panels, no quick actions", async ({ page }) => {
  await loginAs(page, tenant.empty);
  await gotoDashboard(page);
  // Each card links to its detail route; absence of those links is the
  // strongest visible-state signal independent of card copy / icons.
  for (const href of ["/invoices?filter=bezahlt", "/invoices?filter=offen", "/receipts", "/fixed-costs"]) {
    await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
  }
  // The "neue Rechnung" / "neues Angebot" CTA buttons also gate on canSee.
  await expect(page.locator('a[href="/invoices/new"]')).toHaveCount(0);
  await expect(page.locator('a[href="/quotes/new"]')).toHaveCount(0);
  await logout(page);
});

test("qa-rechn-only: only invoice cards + recent invoices + new-invoice CTA", async ({ page }) => {
  await loginAs(page, tenant.rechnOnly);
  await gotoDashboard(page);
  // Visible: invoice routes
  await expect(page.locator('a[href="/invoices?filter=bezahlt"]').first()).toBeVisible();
  await expect(page.locator('a[href="/invoices?filter=offen"]').first()).toBeVisible();
  await expect(page.locator('a[href="/invoices/new"]').first()).toBeVisible();
  // Hidden: quote/receipts/fixed-costs surfaces
  await expect(page.locator('a[href="/quotes/new"]')).toHaveCount(0);
  await expect(page.locator('a[href="/receipts"]')).toHaveCount(0);
  await expect(page.locator('a[href="/fixed-costs"]')).toHaveCount(0);
  await logout(page);
});
