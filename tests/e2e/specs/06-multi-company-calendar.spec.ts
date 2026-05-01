// SCH-976 spec 6 — K2-G7/G8: multi-company calendar API.
//
// qa-multi is admin in two companies. GET /api/time/multi-company-calendar
// must return:
//   - companies[]: one entry per membership, with `can_bill_across` true
//     for owner/admin/rechnungen/angebote permissions.
//   - time_entries[]: a flat array carrying `company_id` per entry (empty
//     here because the fixture seeds no entries; shape still asserted).
//
// We re-use the page's auth cookies via `page.request` so the SSR auth
// path is exercised exactly as the in-app calendar would call it.

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

test("qa-multi: calendar lists both companies with can_bill_across=true", async ({ page }) => {
  await loginAs(page, tenant.multi);
  const res = await page.request.get("/api/time/multi-company-calendar?include_projects=false");
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body).toHaveProperty("companies");
  expect(body).toHaveProperty("time_entries");
  expect(Array.isArray(body.companies)).toBe(true);
  expect(Array.isArray(body.time_entries)).toBe(true);

  const companyIds = (body.companies as Array<{ company_id: string }>).map((c) => c.company_id);
  expect(companyIds).toEqual(expect.arrayContaining([tenant.primarySlug, tenant.secondarySlug]));

  for (const slice of body.companies as Array<{ company_id: string; can_bill_across: boolean; role: string }>) {
    if (slice.company_id === tenant.primarySlug || slice.company_id === tenant.secondarySlug) {
      expect(slice.role).toBe("admin");
      expect(slice.can_bill_across).toBe(true);
    }
  }

  // time_entries[] is flat — each entry must carry company_id (empty array
  // is also acceptable for an unseeded fixture).
  for (const entry of body.time_entries as Array<{ company_id: string }>) {
    expect(entry).toHaveProperty("company_id");
  }
});
