// SCH-976 spec 5 — K2-G10 mobile layout: schedule modal table is horizontally
// scrollable on phone widths.
//
// Implementation (src/app/(app)/admin/page.tsx:1156-1170): the table sits in
// an `overflow-x-auto` wrapper with `min-w-[640px]` on the table itself, so
// at the 375x667 mobile viewport the wrapper's `scrollWidth` exceeds its
// `clientWidth` and all 6 columns remain reachable via horizontal scroll.

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

test("schedule modal table is horizontally scrollable at 375x667", async ({ browser }) => {
  // Login on a desktop viewport so the auth flow + role-load completes against
  // the layout it was designed for (the 375px mobile login form was racing
  // its own renders in CI). Then resize to mobile and exercise the modal —
  // the schedule modal is the actual subject under test, not the login page.
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await loginAs(page, tenant.admin);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/admin");

    const userRow = page.locator("tr", { hasText: tenant.empty.email }).first();
    await userRow.waitFor();
    await userRow.locator("button", { hasText: /zeit|plan|schedule/i }).first().click();

    const modal = page.locator(".fixed.inset-0.z-50");
    await modal.waitFor({ state: "visible" });

    const wrapper = modal.locator(".overflow-x-auto").first();
    await wrapper.waitFor();

    // The table has 6 columns (Day | Active | From | To | Pause | Target);
    // assert presence first.
    expect(await modal.locator("thead th").count()).toBe(6);

    // Then assert overflow: scrollWidth > clientWidth means the user can
    // pan horizontally; min-w-[640px] guarantees this at 375px viewport.
    const overflow = await wrapper.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  } finally {
    await context.close();
  }
});
