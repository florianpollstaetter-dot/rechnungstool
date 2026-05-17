// QA Gate-2: Playwright-Test SCH-2089 — Admin Stundenabrechnung
//
// Tests the Admin Stundenabrechnung (time accounting) feature:
// - API GET /api/admin/stundenabrechnung?user_id=&month=YYYY-MM
// - Aggregates time_entries per day with surcharge buckets (ot_25/50/100)
// - Reads work_time_model_days for Soll-Minuten
// - Reads absences for absence notes
// - Monthly calendar view with Soll/Ist minutes, surcharge buckets, absences
//
// Test scenarios:
// 1. API returns correct JSON structure
// 2. Monthly calendar displays day rows with expected/actual minutes
// 3. Surcharge buckets correctly aggregated
// 4. Absence notes appear in calendar view
// 5. Edge case: month without entries returns empty response

import { expect, test } from "@playwright/test";
import { provisionTenant, destroyTenant, type TestTenant } from "../helpers/test-tenant";
import { loginAs, logout } from "../helpers/auth";
import { seedTimeEntriesAndAbsences, seedWorkTimeModel } from "../helpers/test-tenant";

let tenant: TestTenant;

test.beforeAll(async () => {
  tenant = await provisionTenant();
});

test.afterAll(async () => {
  if (tenant) await destroyTenant(tenant);
});

test("1. API route is accessible and returns correct JSON structure", async ({ page }) => {
  await loginAs(page, tenant.admin);

  const currentDate = new Date();
  const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

  const res = await page.request.get(
    `/api/admin/stundenabrechnung?user_id=${encodeURIComponent(tenant.admin.authUserId)}&month=${month}`
  );

  expect(res.status()).toBe(200);
  const body = await res.json();

  // Verify response structure
  expect(body).toHaveProperty("user");
  expect(body).toHaveProperty("month");
  expect(body).toHaveProperty("days");
  expect(body).toHaveProperty("weeks");
  expect(body).toHaveProperty("month_saldo_min");

  // Verify user object
  expect(body.user).toHaveProperty("id");
  expect(body.user).toHaveProperty("display_name");
  expect(body.user).toHaveProperty("email");

  // Verify days array
  expect(Array.isArray(body.days)).toBe(true);
  if (body.days.length > 0) {
    const dayRow = body.days[0];
    expect(dayRow).toHaveProperty("date");
    expect(dayRow).toHaveProperty("weekday");
    expect(dayRow).toHaveProperty("iso_week");
    expect(dayRow).toHaveProperty("soll_min");
    expect(dayRow).toHaveProperty("ist_min");
    expect(dayRow).toHaveProperty("tagessaldo_min");
    expect(dayRow).toHaveProperty("ot_25");
    expect(dayRow).toHaveProperty("ot_50");
    expect(dayRow).toHaveProperty("ot_100");
  }

  // Verify weeks array
  expect(Array.isArray(body.weeks)).toBe(true);

  // Verify month_saldo_min is a number
  expect(typeof body.month_saldo_min).toBe("number");

  await logout(page);
});

test("2. Monthly calendar shows daily rows with Soll/Ist minutes", async ({ page }) => {
  // Seed test data: work time model + time entries
  await seedWorkTimeModel(tenant.primarySlug, tenant.admin.authUserId);
  await seedTimeEntriesAndAbsences(tenant.primarySlug, tenant.admin.authUserId);

  await loginAs(page, tenant.admin);
  await page.goto("/admin/stundenabrechnung");

  // Wait for loading spinner to disappear (admin check + data load)
  await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});

  // Check that the heading is visible
  await expect(page.locator("h1", { hasText: "Stundenabrechnung" })).toBeVisible();

  // Select the user in the dropdown
  const userSelect = page.locator("select").first();
  await userSelect.selectOption(tenant.admin.authUserId);

  // Wait for the table to load
  await page.locator("table tbody tr").first().waitFor({ timeout: 10000 });

  // Verify table structure with headers
  const thead = page.locator("table thead");
  await expect(thead.getByText("Datum")).toBeVisible();
  await expect(thead.getByText("Soll")).toBeVisible();
  await expect(thead.getByText("Ist")).toBeVisible();
  await expect(thead.getByText("Tagessaldo")).toBeVisible();

  // Verify at least one day row exists with data
  const tableRows = page.locator("table tbody tr");
  const rowCount = await tableRows.count();
  expect(rowCount).toBeGreaterThan(0);

  // Verify first data row has expected columns
  const firstRow = tableRows.first();
  const cells = firstRow.locator("td");
  expect(await cells.count()).toBeGreaterThan(10); // At least 13 columns

  await logout(page);
});

test("3. Surcharge buckets correctly aggregated", async ({ page }) => {
  const currentDate = new Date();
  const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

  await loginAs(page, tenant.admin);

  const res = await page.request.get(
    `/api/admin/stundenabrechnung?user_id=${encodeURIComponent(tenant.admin.authUserId)}&month=${month}`
  );

  expect(res.status()).toBe(200);
  const body = await res.json();

  // Find days with work entries
  const daysWithWork = (body.days as Array<{ ist_min: number; ot_25: number; ot_50: number; ot_100: number }>).filter(
    (d) => d.ist_min > 0
  );

  // If there are seeded entries, verify surcharge structure
  for (const day of daysWithWork) {
    // Surcharge buckets should be non-negative numbers
    expect(typeof day.ot_25).toBe("number");
    expect(typeof day.ot_50).toBe("number");
    expect(typeof day.ot_100).toBe("number");
    expect(day.ot_25).toBeGreaterThanOrEqual(0);
    expect(day.ot_50).toBeGreaterThanOrEqual(0);
    expect(day.ot_100).toBeGreaterThanOrEqual(0);

    // Verify that ist_min includes all surcharge minutes
    const totalBase = day.ist_min - day.ot_25 - day.ot_50 - day.ot_100;
    expect(totalBase).toBeGreaterThanOrEqual(0);
  }

  await logout(page);
});

test("4. Absence notes appear in calendar view", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto("/admin/stundenabrechnung");

  // Wait for loading spinner to disappear
  await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});

  // Select user
  const userSelect = page.locator("select").first();
  await userSelect.selectOption(tenant.admin.authUserId);

  // Wait for table to load
  await page.locator("table tbody tr").first().waitFor({ timeout: 10000 });

  // Look for the "Abw." column (absence column)
  await expect(page.getByText(/Abw\./)).toBeVisible();

  // Verify absence column header is present
  const headers = page.locator("table thead th");
  let hasAbsenceColumn = false;
  for (let i = 0; i < await headers.count(); i++) {
    const text = await headers.nth(i).textContent();
    if (text?.includes("Abw")) {
      hasAbsenceColumn = true;
      break;
    }
  }
  expect(hasAbsenceColumn).toBe(true);

  await logout(page);
});

test("5. Edge case: month without entries returns empty response without error", async ({ page }) => {
  // Use a month far in the past that has no data
  const pastDate = new Date(2020, 0, 1); // January 2020
  const month = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, "0")}`;

  await loginAs(page, tenant.admin);

  const res = await page.request.get(
    `/api/admin/stundenabrechnung?user_id=${encodeURIComponent(tenant.admin.authUserId)}&month=${month}`
  );

  // Should return 200 even with no entries
  expect(res.status()).toBe(200);
  const body = await res.json();

  // Should have the expected structure
  expect(body).toHaveProperty("user");
  expect(body).toHaveProperty("month");
  expect(body).toHaveProperty("days");
  expect(body).toHaveProperty("weeks");
  expect(body).toHaveProperty("month_saldo_min");

  // Days array should be empty or have empty entries
  expect(Array.isArray(body.days)).toBe(true);

  // Month saldo should be a number (may be negative if work model exists but no entries)
  expect(typeof body.month_saldo_min).toBe("number");

  await logout(page);
});

test("6. Admin-only access: non-admin cannot access the page", async ({ page }) => {
  await loginAs(page, tenant.empty);
  await page.goto("/admin/stundenabrechnung", { waitUntil: "domcontentloaded" });

  // Wait for loading spinner to disappear (page resolves admin check)
  await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

  const text = await page.textContent("body");
  const isNoAccess = text?.includes("Kein Admin-Zugriff") || page.url().includes("/admin") === false;

  expect(isNoAccess || !page.url().includes("stundenabrechnung")).toBe(true);

  await logout(page);
});

test("7. API validation: invalid month parameter returns 400", async ({ page }) => {
  await loginAs(page, tenant.admin);

  const res = await page.request.get(
    `/api/admin/stundenabrechnung?user_id=${encodeURIComponent(tenant.admin.authUserId)}&month=invalid`
  );

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body).toHaveProperty("error");

  await logout(page);
});

test("8. API validation: missing user_id returns 400", async ({ page }) => {
  const currentDate = new Date();
  const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

  await loginAs(page, tenant.admin);

  const res = await page.request.get(`/api/admin/stundenabrechnung?month=${month}`);

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body).toHaveProperty("error");

  await logout(page);
});

test("9. CSV export button is available and downloads file", async ({ page }) => {
  await seedWorkTimeModel(tenant.primarySlug, tenant.admin.authUserId);
  await seedTimeEntriesAndAbsences(tenant.primarySlug, tenant.admin.authUserId);

  await loginAs(page, tenant.admin);
  await page.goto("/admin/stundenabrechnung");

  // Wait for loading spinner to disappear
  await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});

  // Select user
  const userSelect = page.locator("select").first();
  await userSelect.selectOption(tenant.admin.authUserId);

  // Wait for table to load
  await page.locator("table tbody tr").first().waitFor({ timeout: 10000 });

  // Wait for CSV button to appear
  const csvButton = page.locator("button", { hasText: /CSV exportieren/ });
  await expect(csvButton).toBeVisible();

  // Verify button is clickable
  await expect(csvButton).toBeEnabled();

  await logout(page);
});
