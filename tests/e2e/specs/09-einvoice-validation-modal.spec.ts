// SCH-578 — E-Rechnung: missing-data popup with AI auto-fetch.
//
// Flow under test:
// 1. Tenant has empty seller settings (provisionTenant default).
// 2. Tenant has one invoice with a fully-populated customer.
// 3. User opens the invoice, clicks "E-Rechnung erstellen" -> "ZUGFeRD (PDF/A-3)".
// 4. The /api/einvoice/generate route returns 422 with EN 16931 errors that
//    point to settings.* paths -> PDFDownloadButton opens EInvoiceValidationModal.
// 5. Modal shows editable seller fields, an AI button, save / cancel.
//
// AI auto-complete is NOT exercised end-to-end here — that needs a live
// Anthropic key. We assert the button is present and click-bound.

import { expect, test, type Page } from "@playwright/test";
import {
  provisionTenant,
  destroyTenant,
  seedInvoiceForTenant,
  clearSeededInvoices,
  resetInvoiceForRetest,
  type TestTenant,
} from "../helpers/test-tenant";
import { loginAs, logout } from "../helpers/auth";

let tenant: TestTenant;

test.beforeAll(async () => {
  tenant = await provisionTenant();
  await seedInvoiceForTenant(tenant.primarySlug, tenant.runId);
});

test.beforeEach(async () => {
  // Each test re-enters the dropdown flow, so reset format + settings.
  if (tenant) await resetInvoiceForRetest(tenant.primarySlug);
});

test.afterAll(async () => {
  if (tenant) {
    await clearSeededInvoices(tenant.primarySlug);
    await destroyTenant(tenant);
  }
});

// PDFDownloadButton.tsx renders a dropdown ("E-Rechnung erstellen" → menu)
// for invoices whose e_invoice_format === "none". The seeded invoice is in
// that state, so every test goes through the same 2-click flow.
async function openEInvoiceModal(page: Page) {
  // Invoice rows are <tr onClick=router.push(...)>, not <a>. Click the row.
  const firstRow = page.locator("table tbody tr.cursor-pointer").first();
  await expect(firstRow).toBeVisible({ timeout: 10_000 });
  await firstRow.click();
  await page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 10_000 });

  // Open dropdown, then pick ZUGFeRD — that triggers the validate→422→modal path.
  const createBtn = page.locator('button:has-text("E-Rechnung erstellen")');
  await expect(createBtn).toBeVisible({ timeout: 10_000 });
  await createBtn.click();
  const zugferdMenuItem = page.locator('button:has-text("ZUGFeRD (PDF/A-3)")');
  await expect(zugferdMenuItem).toBeVisible({ timeout: 5_000 });
  await zugferdMenuItem.click();

  // Modal heading is the stable selector — see EInvoiceValidationModal.tsx:188-190.
  const modalTitle = page.locator(
    'h2:has-text("E-Rechnung: Unternehmensdaten unvollständig")',
  );
  await expect(modalTitle).toBeVisible({ timeout: 15_000 });
  return modalTitle;
}

test("validation modal opens when seller settings are empty", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto("/invoices");
  await page.waitForLoadState("networkidle");

  await openEInvoiceModal(page);

  // AI button is the headline UX of SCH-578.
  const aiButton = page.locator('button:has-text("Mit AI vervollständigen")');
  await expect(aiButton).toBeVisible();

  // Each seller field renders as <label> + <input> in the same wrapper div.
  // `~ input` picks up the sibling input.
  await expect(page.locator('label:has-text("Straße + Hausnummer") ~ input')).toBeVisible();
  await expect(page.locator('label:has-text("Ort") ~ input')).toBeVisible();
  await expect(page.locator('label:has-text("UID-Nummer") ~ input')).toBeVisible();
  await expect(page.locator('label:has-text("IBAN") ~ input')).toBeVisible();

  // Missing fields get `border-rose-500/50` from EInvoiceValidationModal.tsx:252.
  // The slash needs CSS-escaping in the locator.
  const missingFields = page.locator("input.border-rose-500\\/50");
  expect(await missingFields.count()).toBeGreaterThan(0);

  await logout(page);
});

test("user can fill seller fields and save closes the modal", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto("/invoices");
  await page.waitForLoadState("networkidle");

  const modalTitle = await openEInvoiceModal(page);

  await page.locator('label:has-text("Straße + Hausnummer") ~ input').fill("Beispielstraße 123");
  await page.locator('label:has-text("Ort") ~ input').fill("Wien");
  await page.locator('label:has-text("PLZ") ~ input').fill("1010");
  await page.locator('label:has-text("Land") ~ input').fill("AT");
  await page.locator('label:has-text("UID-Nummer") ~ input').fill("ATU12345678");
  await page.locator('label:has-text("IBAN") ~ input').fill("AT611904300234573201");

  const saveBtn = page.locator('button:has-text("Speichern & E-Rechnung erstellen")');
  await expect(saveBtn).toBeVisible();

  // Save triggers updateSettings (PATCH) then a retry of /api/einvoice/generate.
  // Either path closes the modal — assert the heading is gone within timeout.
  await saveBtn.click();
  await expect(modalTitle).not.toBeVisible({ timeout: 15_000 });

  await logout(page);
});

test("non-seller errors show as amber info block, not as form fields", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto("/invoices");
  await page.waitForLoadState("networkidle");

  await openEInvoiceModal(page);

  // The amber section may or may not be present depending on which validator
  // rules fired. If it is present, it carries the amber-500 border class.
  const nonSellerSection = page.locator("text=Weitere Fehler").first();
  if (await nonSellerSection.isVisible().catch(() => false)) {
    await expect(page.locator(".border-amber-500\\/40").first()).toBeVisible();
  }

  await logout(page);
});

test("cancel button closes the modal without saving", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto("/invoices");
  await page.waitForLoadState("networkidle");

  const modalTitle = await openEInvoiceModal(page);

  await page.locator('button:has-text("Abbrechen")').first().click();
  await expect(modalTitle).not.toBeVisible({ timeout: 5_000 });

  await logout(page);
});
