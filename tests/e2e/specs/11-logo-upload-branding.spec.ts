// SCH-958 spec 11 — K3-AA1 Logo-Upload + Branding section.
//
// Asserted flow:
// 1. Admin opens /settings#branding -> "Branding & Logo" card is visible.
// 2. Admin uploads a tiny PNG via the hidden file input -> preview img
//    resolves to a public URL under storage/v1/object/public/company-logos/.
// 3. Service-role read of company_settings.logo_url matches the same URL —
//    proves the upload + RLS-guarded path actually wrote through.
// 4. Admin clicks "Logo entfernen" -> preview disappears + DB row clears.
// 5. Non-admin (qa-empty, role=member) does NOT see the Branding card.
//
// We mint a 1×1 transparent PNG inline so the spec has zero filesystem
// dependencies and can run on a fresh Vercel deploy without prebuilt fixtures.

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  provisionTenant,
  destroyTenant,
  type TestTenant,
} from "../helpers/test-tenant";
import { loginAs, logout } from "../helpers/auth";
import { loadEnv } from "../helpers/env";

let tenant: TestTenant;

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test.beforeAll(async () => {
  tenant = await provisionTenant();
});

test.afterAll(async () => {
  if (tenant) await destroyTenant(tenant);
});

test("admin uploads + persists + removes a company logo", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto("/settings#branding");
  await page.waitForLoadState("networkidle");

  const heading = page.locator('h2', { hasText: /Branding\s*&\s*Logo/ });
  await expect(heading).toBeVisible({ timeout: 10_000 });

  // The <input type=file> is .hidden; setInputFiles works on hidden inputs.
  const fileInput = page.locator('input[type="file"][accept="image/*"]');
  await fileInput.setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });

  // After upload the placeholder span goes away and an <img alt="Logo"> renders.
  const previewImg = page.locator('img[alt="Logo"]').first();
  await expect(previewImg).toBeVisible({ timeout: 20_000 });
  const previewSrc = await previewImg.getAttribute("src");
  expect(previewSrc).toMatch(/\/storage\/v1\/object\/public\/company-logos\//);
  expect(previewSrc).toContain(tenant.primarySlug);

  // Service-role assertion that the row was actually updated.
  const env = loadEnv();
  const svc = createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: rowAfter, error: readErr } = await svc
    .from("company_settings")
    .select("logo_url")
    .eq("company_id", tenant.primarySlug)
    .single();
  expect(readErr).toBeNull();
  expect(rowAfter?.logo_url).toBe(previewSrc);

  // The action button label flips upload -> change once a logo exists.
  await expect(
    page.getByRole("button", { name: /Logo ändern|Change logo/ }),
  ).toBeVisible();

  // Remove path: button click -> img count goes to 0 + DB clears.
  await page.getByRole("button", { name: /Logo entfernen|Remove logo/ }).click();
  await expect(page.locator('img[alt="Logo"]')).toHaveCount(0, { timeout: 15_000 });

  const { data: rowCleared } = await svc
    .from("company_settings")
    .select("logo_url")
    .eq("company_id", tenant.primarySlug)
    .single();
  expect(rowCleared?.logo_url).toBe("");

  await logout(page);
});

test("non-admin member does not see the Branding card", async ({ page }) => {
  await loginAs(page, tenant.empty);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await expect(
    page.locator('h2', { hasText: /Branding\s*&\s*Logo/ }),
  ).toHaveCount(0);
  await logout(page);
});
