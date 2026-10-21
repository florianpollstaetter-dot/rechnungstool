// ORA-3310 — auth gate for the four service-role API routes that previously
// trusted a caller-supplied `companyId` with no session check.
//
// Live finding (21.10.2026): an anonymous POST to /api/einvoice/datev with a
// made-up companyId returned 200 text/csv. The proxy now fails closed for
// /api/* and each route additionally verifies company membership. This spec
// pins both layers:
//
//   - No login            → 401 (enforced by src/proxy.ts)
//   - Logged in as the WRONG company → 403 (enforced by companyMemberGuard
//     inside each route)
//
// We provision two independent tenants. Tenant B's admin is a real, fully
// valid session — it just has no membership in Tenant A, which is exactly the
// cross-company case the DATEV leak exploited.

import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { provisionTenant, destroyTenant, type TestTenant } from "../helpers/test-tenant";

let tenantA: TestTenant;
let tenantB: TestTenant;

test.beforeAll(async () => {
  tenantA = await provisionTenant();
  tenantB = await provisionTenant();
});

test.afterAll(async () => {
  if (tenantA) await destroyTenant(tenantA).catch(() => undefined);
  if (tenantB) await destroyTenant(tenantB).catch(() => undefined);
});

// Each entry hits one route with the minimum body/params the handler needs to
// reach the membership guard, targeting Tenant A's company id.
function routeCases(companyId: string, userId: string) {
  return [
    {
      name: "POST /api/einvoice/datev",
      call: (ctx: APIRequestContext) =>
        ctx.post("/api/einvoice/datev", { data: { companyId } }),
    },
    {
      name: "POST /api/projects/create-from-quote",
      call: (ctx: APIRequestContext) =>
        ctx.post("/api/projects/create-from-quote", {
          data: { quoteId: "00000000-0000-0000-0000-000000000000", companyId },
        }),
    },
    {
      name: "POST /api/company/setup-suggestions",
      call: (ctx: APIRequestContext) =>
        ctx.post("/api/company/setup-suggestions", {
          data: { companyName: "QA Probe", companyId },
        }),
    },
    {
      name: "GET /api/dashboard/layout",
      call: (ctx: APIRequestContext) =>
        ctx.get(
          `/api/dashboard/layout?companyId=${encodeURIComponent(companyId)}&userId=${encodeURIComponent(userId)}`,
        ),
    },
  ];
}

test.describe("ORA-3310 — API auth gate", () => {
  test("without a login every protected route returns 401", async ({ request }) => {
    // `request` is the cookie-less APIRequestContext → anonymous caller.
    for (const rc of routeCases(tenantA.primarySlug, tenantA.admin.authUserId)) {
      const res = await rc.call(request);
      expect(res.status(), `${rc.name} without login`).toBe(401);
      // Must NOT leak a CSV / company payload.
      expect(
        res.headers()["content-type"] ?? "",
        `${rc.name} content-type`,
      ).not.toContain("text/csv");
    }
  });

  test("logged in as a foreign company every protected route returns 403", async ({ page }) => {
    // Real, valid session for Tenant B's admin — no membership in Tenant A.
    await loginAs(page, { email: tenantB.admin.email, password: tenantB.admin.password });

    for (const rc of routeCases(tenantA.primarySlug, tenantB.admin.authUserId)) {
      const res = await rc.call(page.request);
      expect(res.status(), `${rc.name} as foreign company`).toBe(403);
      expect(
        res.headers()["content-type"] ?? "",
        `${rc.name} content-type`,
      ).not.toContain("text/csv");
    }
  });
});
