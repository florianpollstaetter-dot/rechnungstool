// SCH-976 spec 1 — K2-G2/G3/G4 sidebar permission gating.
//
// For each test user we sign in, snapshot the visible accounting nav items
// from the desktop sidebar (`aside[aria-label="Hauptnavigation"]`), and
// assert against the expected set. ALWAYS_ON sections (Dashboard / Spesen /
// Zeit) appear for every authenticated user.

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

async function visibleNavHrefs(page: import("@playwright/test").Page): Promise<string[]> {
  const sidebar = page.locator('aside[aria-label="Hauptnavigation"]');
  await sidebar.waitFor({ state: "visible" });
  const hrefs = await sidebar.locator("a").evaluateAll((els) =>
    els.map((el) => el.getAttribute("href") || "").filter(Boolean),
  );
  // Strip query strings (time tab variants) so we compare base routes.
  return hrefs.map((h) => h.split("?")[0]);
}

test("qa-empty sees only ALWAYS_ON sections (dashboard / expenses / time)", async ({ page }) => {
  await loginAs(page, tenant.empty);
  const hrefs = await visibleNavHrefs(page);
  expect(hrefs).toEqual(expect.arrayContaining(["/dashboard", "/expenses", "/time"]));
  // None of the gated accounting sections should appear.
  for (const gated of ["/quotes", "/invoices", "/customers", "/products", "/fixed-costs", "/receipts", "/bank", "/export"]) {
    expect(hrefs).not.toContain(gated);
  }
  await logout(page);
});

test("qa-rechn-only sees ALWAYS_ON + invoices, nothing else from the gated set", async ({ page }) => {
  await loginAs(page, tenant.rechnOnly);
  const hrefs = await visibleNavHrefs(page);
  expect(hrefs).toEqual(expect.arrayContaining(["/dashboard", "/expenses", "/time", "/invoices"]));
  for (const gated of ["/quotes", "/customers", "/products", "/fixed-costs", "/receipts", "/bank", "/export"]) {
    expect(hrefs).not.toContain(gated);
  }
  await logout(page);
});

test("qa-admin sees every accounting section", async ({ page }) => {
  await loginAs(page, tenant.admin);
  const hrefs = await visibleNavHrefs(page);
  for (const required of [
    "/dashboard",
    "/quotes",
    "/invoices",
    "/customers",
    "/products",
    "/fixed-costs",
    "/receipts",
    "/bank",
    "/export",
    "/expenses",
    "/time",
  ]) {
    expect(hrefs).toContain(required);
  }
  await logout(page);
});
