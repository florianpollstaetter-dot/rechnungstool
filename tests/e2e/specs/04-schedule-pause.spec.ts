// SCH-976 spec 4 — K2-G10 dynamic-pause derivation in the admin schedule modal.
//
// Formula (src/app/(app)/admin/page.tsx:341-348):
//   daily_target_minutes = (end_time − start_time) − unpaid_break_minutes
//   …re-derived whenever start, end, or break changes, unless the admin
//   has explicitly overridden the target.
//
// Window 09:00→17:00 = 480 min:
//   break = 30 → target = 450
//   break = 60 → target = 420

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

test("admin schedule modal: pause 30 → target 450, pause 60 → target 420", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto("/admin");

  // Open the schedule modal for any user — we use qa-empty so a fresh
  // schedule (no prior overrides) is loaded with the default Mon-Fri rows.
  // The "Zeitplan" / scheduleTitle button sits in the user row.
  const userRow = page
    .locator("tr", { hasText: tenant.empty.email })
    .first();
  await userRow.waitFor();
  await userRow.locator("button", { hasText: /zeit|plan|schedule/i }).first().click();

  const modal = page.locator(".fixed.inset-0.z-50");
  await modal.waitFor({ state: "visible" });

  // Monday is the first row in tbody (weekday=0 in the draft, "Montag").
  const monday = modal.locator("tbody tr").first();
  await monday.locator('input[type="time"]').first().fill("09:00");
  await monday.locator('input[type="time"]').nth(1).fill("17:00");

  // Set break = 30 → target should auto-derive to 450.
  const breakInput = monday.locator('input[type="number"]').first();
  const targetInput = monday.locator('input[type="number"]').nth(1);
  await breakInput.fill("30");
  await breakInput.blur();
  await expect(targetInput).toHaveValue("450");

  // Bump break to 60 → target re-derives to 420.
  await breakInput.fill("60");
  await breakInput.blur();
  await expect(targetInput).toHaveValue("420");
});
