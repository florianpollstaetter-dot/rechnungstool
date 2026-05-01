// SCH-976 spec 3 — K2-G9: UserWorkScheduleSection in /settings is admin-only.
//
// Settings page wraps <UserWorkScheduleSection /> in `{isAdmin && (...)}`
// at src/app/(app)/settings/page.tsx:570. qa-empty (employee role) must
// not see the section; qa-admin must see it and have the per-weekday
// schedule editor mounted.

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

// Heading text comes from the i18n key `settings.workScheduleTitle` —
// rendered as "Arbeitszeitmodell" in de-AT. Plural ending tolerated for
// historical translation drift.
const WORK_SCHEDULE_HEADING = /Arbeitszeitmodelle?/i;

test("qa-empty cannot see the work-schedule section in /settings", async ({ page }) => {
  await loginAs(page, tenant.empty);
  await page.goto("/settings");
  await page.locator("h1, h2").first().waitFor();
  await expect(page.getByText(WORK_SCHEDULE_HEADING)).toHaveCount(0);
  await logout(page);
});

test("qa-admin sees the work-schedule section with editable per-weekday rows", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto("/settings");
  await expect(page.getByText(WORK_SCHEDULE_HEADING).first()).toBeVisible();
  // The editor renders one row per weekday with a time-input and a number-input
  // (for break minutes). Presence of >= 5 time inputs proves the workday rows
  // are mounted; we don't assert exact count to stay resilient if Saturday/
  // Sunday rendering changes.
  await expect(page.locator('input[type="time"]').first()).toBeVisible();
  expect(await page.locator('input[type="time"]').count()).toBeGreaterThanOrEqual(5);
  await logout(page);
});
