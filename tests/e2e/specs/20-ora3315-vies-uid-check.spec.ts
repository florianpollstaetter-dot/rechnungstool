// ORA-3315 — VIES UID check UI in the customer form.
//
// Drives the "UID prüfen (VIES)" button in the new-customer form and asserts
// the three user-visible states. The /api/customers/verify-uid route is mocked
// with page.route so the test never hits the real (flaky) VIES service and
// stays deterministic — the same mock the unit tests use at the lib level.
//
// Produces screenshots under tests/e2e/.artifacts for the ticket:
//   ora3315-uid-valid.png, ora3315-uid-invalid.png, ora3315-uid-unavailable.png

import { expect, test } from "@playwright/test";
import { provisionTenant, destroyTenant, type TestTenant } from "../helpers/test-tenant";
import { loginAs } from "../helpers/auth";

let tenant: TestTenant;

test.beforeAll(async () => {
  tenant = await provisionTenant();
});

test.afterAll(async () => {
  if (tenant) await destroyTenant(tenant);
});

async function openNewCustomerWithUid(page: import("@playwright/test").Page, uid: string) {
  await loginAs(page, tenant.admin);
  await page.goto("/customers");
  await page.getByRole("button", { name: /Neuer Kunde/i }).click();
  // New-customer mode starts collapsed to name/company — reveal all fields.
  await page.getByRole("button", { name: /Manuell ausfüllen/i }).click();
  await page.getByLabel(/UID-Nummer/i).fill(uid);
}

function mockVies(page: import("@playwright/test").Page, body: Record<string, unknown>, status = 200) {
  return page.route("**/api/customers/verify-uid", async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test("valid UID shows green confirmation with company name", async ({ page }) => {
  await openNewCustomerWithUid(page, "ATU12345678");
  await mockVies(page, {
    status: "valid",
    uid: "ATU12345678",
    name: "VR the Fans GmbH",
    checkedAt: new Date().toISOString(),
  });

  await page.getByRole("button", { name: /UID prüfen/i }).click();
  const badge = page.getByText(/UID gültig/i);
  await expect(badge).toBeVisible();
  // Name is rendered inside the status badge, prefixed with "— "; scope to it
  // so we don't collide with the "© VR the Fans GmbH" page footer.
  await expect(page.getByText("— VR the Fans GmbH")).toBeVisible();
  await page.screenshot({ path: "tests/e2e/.artifacts/ora3315-uid-valid.png", fullPage: false });
});

test("invalid UID shows red rejection", async ({ page }) => {
  await openNewCustomerWithUid(page, "ATU99999999");
  await mockVies(page, { status: "invalid", uid: "ATU99999999", checkedAt: new Date().toISOString() });

  await page.getByRole("button", { name: /UID prüfen/i }).click();
  await expect(page.getByText(/UID ungültig/i)).toBeVisible();
  await page.screenshot({ path: "tests/e2e/.artifacts/ora3315-uid-invalid.png", fullPage: false });
});

test("VIES outage shows amber 'not reachable' warning, never blocks", async ({ page }) => {
  await openNewCustomerWithUid(page, "ATU12345678");
  await mockVies(page, { status: "unavailable", uid: "ATU12345678", checkedAt: null });

  await page.getByRole("button", { name: /UID prüfen/i }).click();
  await expect(page.getByText(/nicht erreichbar/i)).toBeVisible();
  // Save must stay enabled — the check is non-blocking.
  await expect(page.getByRole("button", { name: /^Speichern$/ })).toBeEnabled();
  await page.screenshot({ path: "tests/e2e/.artifacts/ora3315-uid-unavailable.png", fullPage: false });
});
