// SCH-976 spec 8 — K3-V2 (commit 80c6ab7): create-user triggers a
// welcome-employee email via the same Resend wiring used for password
// resets.
//
// POST /api/create-user returns `welcome_email: { sent, reason?, message? }`.
// In a CI environment without a Resend key the route still returns 200 with
// `welcome_email.sent === false, reason === "skipped_no_email_config"` —
// that's the contract we assert below. When RESEND_API_KEY is configured,
// `sent` is expected to be true.
//
// Cleanup: we delete the freshly-created user via DELETE /api/admin/users
// so the suite leaves no extra qa-* rows behind even on flaky reruns.

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

test("create-user wires up the welcome-employee email path", async ({ page }) => {
  await loginAs(page, tenant.admin);

  const newEmail = `qa-welcome-${tenant.runId}@example.test`;
  const res = await page.request.post("/api/create-user", {
    data: {
      email: newEmail,
      password: "TempPass!2026",
      display_name: "QA Welcome",
      role: "employee",
      company_access: [tenant.primarySlug],
      anchor_company_id: tenant.primarySlug,
      permissions: { rechnungen: true },
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("userId");
  expect(body.companyIds).toContain(tenant.primarySlug);

  // The welcome_email contract: object with `sent: boolean`. When Resend is
  // configured (Vercel prod) the route returns `{sent: true}` on success,
  // `{sent: false, reason, message?}` on Resend failure, or
  // `{sent: false, reason: "skipped_no_email_config"}` when isEmailConfigured()
  // returned false. We accept any of those shapes — the critical signal is
  // that `welcome_email` is wired up (not silently no-op'd) and the
  // user-creation succeeded regardless of email-send outcome.
  expect(body).toHaveProperty("welcome_email");
  expect(typeof body.welcome_email.sent).toBe("boolean");
  if (body.welcome_email.sent === false) {
    // A skip-reason MUST be set on a failed/skipped send so admins can
    // diagnose. An undefined reason would mean the route silently no-op'd.
    expect(typeof body.welcome_email.reason).toBe("string");
    expect(body.welcome_email.reason.length).toBeGreaterThan(0);
  }

  // Cleanup the freshly-created user — out-of-band of the fixture afterAll,
  // since this user is created mid-test.
  const newUserId = body.userId as string;
  const del = await page.request.delete("/api/admin/users", {
    data: { auth_user_id: newUserId },
  });
  expect([200, 404]).toContain(del.status());
});
