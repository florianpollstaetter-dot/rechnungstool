// ORA-2465 / ORA-2489 — Critical-path smoke for the Korrekturphase (correction phase).
//
// Real money-path assertions (the prior version of this file was a no-op: it
// clicked Stornieren with no dialog handler, swallowed the timeout, and
// asserted nothing about the resulting state). This version proves the path
// end to end:
//   1. Login as the QA admin.
//   2. Orange branding (K2) is live.
//   3. Storno money-path: click Stornieren on a finalized invoice, accept the
//      native confirm() (the ORA-2466 "freeze" was an unhandled dialog), then
//      assert the original flips to `storniert` AND a `STORNO zu …`
//      Stornorechnung is generated — and that it survives a reload.
//   4. No critical console errors on the flow.

import { expect, test } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import {
  provisionTenant,
  destroyTenant,
  seedInvoiceForTenant,
  clearSeededInvoices,
  type TestTenant,
  type SeededInvoice,
} from "../helpers/test-tenant";

let tenant: TestTenant;
let seeded: SeededInvoice;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  tenant = await provisionTenant();
  seeded = await seedInvoiceForTenant(tenant.primarySlug, tenant.runId);
  console.log(`Seeded tenant ${tenant.primarySlug} with invoice ${seeded.invoiceNumber}`);
});

test.afterAll(async () => {
  if (tenant) {
    await clearSeededInvoices(tenant.primarySlug).catch(() => undefined);
    await destroyTenant(tenant).catch(() => undefined);
  }
});

test.describe("ORA-2465: Critical-path smoke (Korrekturphase)", () => {
  test("login + orange branding + Storno money-path persists, no critical console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(e.toString()));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    // ORA-2466: the Stornieren handler calls native window.confirm(); without a
    // dialog handler the CDP channel blocks (the reported "freeze"). Accept it.
    page.on("dialog", (d) => {
      d.accept().catch(() => undefined);
    });

    // 1. Login
    await loginAs(page, tenant.admin);
    expect(page.url()).toContain("/dashboard");

    // 2. K2 branding: orange primary color is present
    const orange = page.locator('[class*="orange"], [style*="orange"]');
    expect(await orange.count()).toBeGreaterThan(0);

    // 3. Storno money-path
    await page.getByRole("link", { name: /Rechnungen|Invoices/i }).first().click();
    await page.waitForURL((url) => url.pathname === "/invoices", { timeout: 15000 });

    // The seeded (finalized) invoice is listed.
    await expect(page.getByText(seeded.invoiceNumber)).toBeVisible({ timeout: 15000 });

    // Exactly one non-storniert invoice exists, so one Stornieren button.
    const stornoBtn = page.locator('button[title="Stornieren"]');
    await expect(stornoBtn).toHaveCount(1);
    await stornoBtn.first().click();

    // The auto-generated Stornorechnung (project_description "STORNO zu <nr>")
    // appears, and the original row flips to the "Storniert" badge.
    await expect(page.getByText(`STORNO zu ${seeded.invoiceNumber}`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Storniert").first()).toBeVisible({ timeout: 15000 });

    // 4. Persistence across reload
    await page.reload();
    await page.waitForURL((url) => url.pathname === "/invoices", { timeout: 15000 });
    await expect(page.getByText(`STORNO zu ${seeded.invoiceNumber}`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(seeded.invoiceNumber).first()).toBeVisible({ timeout: 15000 });

    // Console: a real JS crash arrives via the `pageerror` listener above and
    // is never filtered. Here we drop only environmental noise that is not an
    // app-code exception: network races, background resource HTTP statuses
    // (e.g. PostgREST 406 from an empty `.single()` in a freshly-seeded
    // tenant), the Next dev-server "script behind a redirect" preload artifact,
    // and the pre-existing minified React #418 hydration warning the manual
    // prod run already noted as non-blocking.
    const critical = consoleErrors.filter(
      (e) =>
        !/Failed to fetch|NetworkError|net::ERR|Failed to load resource|Minified React error #418|hydrat|script resource is behind a redirect/i.test(
          e,
        ),
    );
    expect(critical, `unexpected console errors: ${critical.join(" | ")}`).toHaveLength(0);
  });
});
