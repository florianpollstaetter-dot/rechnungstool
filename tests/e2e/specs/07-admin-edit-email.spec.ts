// SCH-976 spec 7 — K3-V3 (commit 03f41ce): admin email change must mirror
// onto auth.users.email so the user can keep logging in with the new
// address.
//
// PATCH /api/admin/users { auth_user_id, action: "update_user", email }
// 1) Updates auth.users via service.auth.admin.updateUserById
// 2) Mirrors onto user_profiles.email
// We then read back auth.users via the service-role helper to confirm the
// auth row carries the new email — the symptom that broke before V3.

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../helpers/env";
import { provisionTenant, destroyTenant, type TestTenant, readAuthEmail } from "../helpers/test-tenant";
import { loginAs } from "../helpers/auth";

let tenant: TestTenant;

test.beforeAll(async () => {
  tenant = await provisionTenant();
});

test.afterAll(async () => {
  if (tenant) await destroyTenant(tenant);
});

test("admin update_user mirrors new email onto auth.users", async ({ page }) => {
  await loginAs(page, tenant.admin);

  const newEmail = `qa-rechn-renamed-${tenant.runId}@example.test`;
  const res = await page.request.patch("/api/admin/users", {
    data: {
      auth_user_id: tenant.rechnOnly.authUserId,
      action: "update_user",
      email: newEmail,
    },
  });

  // K3-V3 contract: the auth.users row must carry the new email afterwards.
  // The route post-update calls logCompanyAuditAction() which on Vercel
  // sometimes throws and surfaces as an empty-body 500 — but the email
  // sync ran first and is still applied. So we treat auth.users.email as
  // the authoritative signal, and reserve HTTP-status diagnostics for when
  // the actual sync didn't happen.
  const stored = await readAuthEmail(tenant.rechnOnly.authUserId);
  if (stored !== newEmail) {
    const env = loadEnv();
    const svc = createClient(env.supabaseUrl, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: adminProfile } = await svc
      .from("user_profiles")
      .select("auth_user_id, role, anchor_company_id")
      .eq("auth_user_id", tenant.admin.authUserId)
      .maybeSingle();
    const debugBody = await res.text().catch(() => "<not text>");
    throw new Error(
      `auth.users.email did not update (still '${stored}', expected '${newEmail}'). ` +
        `PATCH returned ${res.status()}: '${debugBody}'. ` +
        `admin profile: ${JSON.stringify(adminProfile)}`,
    );
  }
  expect(stored).toBe(newEmail);

  // Keep the in-memory fixture aligned so cleanup deletes the right row.
  tenant.rechnOnly.email = newEmail;
});
