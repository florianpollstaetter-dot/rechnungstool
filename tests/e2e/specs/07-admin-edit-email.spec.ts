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
  if (res.status() !== 200) {
    // Surface server-side error verbatim so a flake or auth regression is
    // diagnosable from the CI log without re-running with extra debug.
    // Vercel sometimes returns an empty 500 body when the route handler
    // throws — also dump the admin's profile + memberships so we can spot
    // an auth/role regression vs. a real server fault.
    const env = loadEnv();
    const svc = createClient(env.supabaseUrl, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: adminProfile } = await svc
      .from("user_profiles")
      .select("auth_user_id, role, anchor_company_id")
      .eq("auth_user_id", tenant.admin.authUserId)
      .maybeSingle();
    const { data: adminMemberships } = await svc
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", tenant.admin.authUserId);
    const { data: adminAuth } = await svc.auth.admin.getUserById(tenant.admin.authUserId);
    const debugBody = await res.text();
    throw new Error(
      `PATCH /api/admin/users returned ${res.status()}: '${debugBody}'\n` +
        `admin user_profile: ${JSON.stringify(adminProfile)}\n` +
        `admin memberships: ${JSON.stringify(adminMemberships)}\n` +
        `admin auth.users.app_metadata: ${JSON.stringify(adminAuth?.user?.app_metadata)}`,
    );
  }
  const body = await res.json();
  expect(body.updated).toBe(true);
  expect(body.email_changed).toBe(true);

  // Authoritative check: read auth.users directly via service role.
  const stored = await readAuthEmail(tenant.rechnOnly.authUserId);
  expect(stored).toBe(newEmail);

  // Keep the in-memory fixture aligned so cleanup deletes the right row
  // (auth.admin.deleteUser keys on id, but the test-tenant teardown also
  // touches user_profiles by auth_user_id which is unchanged).
  tenant.rechnOnly.email = newEmail;
});
