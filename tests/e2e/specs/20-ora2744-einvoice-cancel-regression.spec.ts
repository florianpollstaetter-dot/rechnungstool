// ORA-2744 / SCH-1031 — Regression: E-Rechnung cancel-flow must not persist
// e_invoice_format.
//
// Bug (SCH-1031): handleCreateEInvoice set e_invoice_format (e.g. "zugferd")
// BEFORE the EN-16931 validation ran. If validation failed AND the user hit
// "Abbrechen" in the modal, the invoice stayed permanently marked as an
// e-invoice even though none was ever produced.
//
// Fix (ORA-2266, commit 24dee60 on master): PDFDownloadButton now commits the
// format via persistFormatIfChanged() only AFTER validation + download succeed.
//
// This spec replaces Florian's manual live-verification with a permanent
// regression (Rule-1 automation). It drives the real UI against the deployed
// environment: for each e-invoice format offered in the dropdown it opens the
// validation modal, cancels, and asserts the DB column is still "none".
//
// Format coverage note: the app implements exactly two e-invoice formats —
// EInvoiceFormat = "none" | "zugferd" | "xrechnung" (src/lib/types.ts). There
// is NO separate "Factur-X" format: Factur-X is the French label for the same
// CII/PDF-A3 hybrid standard as ZUGFeRD, so the ZUGFeRD case already exercises
// that code path. Both real formats are covered below.

import { expect, test, type Page } from "@playwright/test";
import {
  provisionTenant,
  destroyTenant,
  seedInvoiceForTenant,
  clearSeededInvoices,
  readSeededInvoiceFormat,
  type TestTenant,
} from "../helpers/test-tenant";
import { loginAs, logout } from "../helpers/auth";

let tenant: TestTenant;

test.beforeAll(async () => {
  tenant = await provisionTenant();
  await seedInvoiceForTenant(tenant.primarySlug, tenant.runId);
});

test.afterAll(async () => {
  if (tenant) {
    await clearSeededInvoices(tenant.primarySlug);
    await destroyTenant(tenant);
  }
});

// The dropdown labels rendered by PDFDownloadButton.tsx for each format.
const FORMAT_CASES: { format: string; menuLabel: string }[] = [
  { format: "zugferd", menuLabel: "ZUGFeRD (PDF/A-3)" },
  { format: "xrechnung", menuLabel: "XRechnung (XML)" },
];

// Open the invoice, pick the given e-invoice format from the "E-Rechnung
// erstellen" dropdown, and wait for the EN-16931 validation modal to appear.
// The seeded tenant has empty seller settings, so every format's generate call
// returns settings.* validation errors → hasSellerFixableErrors → modal opens.
async function openEInvoiceModal(page: Page, menuLabel: string) {
  const firstRow = page.locator("table tbody tr.cursor-pointer").first();
  await expect(firstRow).toBeVisible({ timeout: 10_000 });
  await firstRow.click();
  await page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 10_000 });

  const createBtn = page.locator('button:has-text("E-Rechnung erstellen")');
  await expect(createBtn).toBeVisible({ timeout: 10_000 });
  await createBtn.click();

  const menuItem = page.locator(`button:has-text("${menuLabel}")`);
  await expect(menuItem).toBeVisible({ timeout: 5_000 });
  await menuItem.click();

  const modalTitle = page.locator(
    'h2:has-text("E-Rechnung: Unternehmensdaten unvollständig")',
  );
  await expect(modalTitle).toBeVisible({ timeout: 15_000 });
  return modalTitle;
}

for (const { format, menuLabel } of FORMAT_CASES) {
  test(`cancel after ${format} validation failure does not persist e_invoice_format (ORA-2744)`, async ({
    page,
  }) => {
    await loginAs(page, tenant.admin);
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");

    // Precondition: invoice is not yet an e-invoice.
    const before = await readSeededInvoiceFormat(tenant.primarySlug);
    expect(before).toBe("none");

    const modalTitle = await openEInvoiceModal(page, menuLabel);

    // Cancel the modal — the fix must leave the format untouched.
    await page.locator('button:has-text("Abbrechen")').first().click();
    await expect(modalTitle).not.toBeVisible({ timeout: 5_000 });

    // The regression assertion: format is still "none", NOT the picked format.
    const after = await readSeededInvoiceFormat(tenant.primarySlug);
    expect(after).not.toBe(format);
    expect(after).toBe("none");

    await logout(page);
  });
}
