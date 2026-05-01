// SCH-976 — login page-object. Deliberately uses the real /login form
// (Supabase signInWithPassword) so cookies set by the SSR client are the
// same shape the rest of the app expects. Programmatic login via Supabase
// JS would skip the cookie/JWT exchange the middleware relies on.

import type { Page } from "@playwright/test";

export interface Credentials {
  email: string;
  password: string;
}

export async function loginAs(page: Page, creds: Credentials): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard"), {
      timeout: 30_000,
    }),
    page.locator('button[type="submit"]').click(),
  ]);
}

export async function logout(page: Page): Promise<void> {
  // Clear cookies + storage rather than chasing the logout button — keeps
  // the PO resilient to copy/icon changes in the sidebar footer.
  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // pages without storage access (about:blank etc) — safe to ignore.
    }
  });
}
