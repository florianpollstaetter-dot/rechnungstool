// SCH-976 — login page-object. Deliberately uses the real /login form
// (Supabase signInWithPassword) so cookies set by the SSR client are the
// same shape the rest of the app expects. Programmatic login via Supabase
// JS would skip the cookie/JWT exchange the middleware relies on.
//
// Multi-test reliability: clear cookies + storage BEFORE navigating to
// /login. Otherwise a stale Supabase session from the previous test
// short-circuits the redirect and the form submit never re-authenticates,
// leaving the page rendered as the previous user (or with a partially
// loaded role context — what we hit on the first CI run).

import type { Page } from "@playwright/test";

export interface Credentials {
  email: string;
  password: string;
}

// ORA-2946 — Pre-seed cookie-consent so CookieBanner (SCH-819/ORA-2918) never
// opens during the suite. The banner is a `z-[110] fixed` card; without this it
// collides with `.fixed` locators (e.g. the settings modal in spec 25) and can
// intercept clicks. CookieBanner only renders when readCookieConsent() is null,
// so writing a valid StoredConsent to localStorage keeps it closed. Registered
// as an init script so it re-applies on every navigation, surviving the
// localStorage.clear() below.
const CONSENT_STORAGE_KEY = "octo-cookie-consent-v1";
async function seedCookieConsent(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    try {
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            categories: { essential: true, analytics: false, marketing: false },
            timestamp: new Date().toISOString(),
            version: 1,
          }),
        );
      }
    } catch {
      /* localStorage blocked */
    }
  }, CONSENT_STORAGE_KEY);
}

export async function loginAs(page: Page, creds: Credentials): Promise<void> {
  await seedCookieConsent(page);
  await page.context().clearCookies();
  // localStorage clear has to happen on a same-origin page; clearing it on
  // about:blank silently no-ops. Hit /login first, then clear, then re-enter.
  await page.goto("/login");
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* about:blank or other unprivileged context */
    }
  });
  await page.goto("/login");
  await page.locator('input[type="email"]').waitFor({ state: "visible" });
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  // SCH-976 — sidebar role context loads asynchronously: until `roleLoaded`
  // is true the nav is just `[/dashboard, /settings]`. We need to wait for
  // a stable post-load signal before any test snapshots the nav. The
  // first-rendered marker is `useCompany().userName` populating the greeting
  // line. We use the simpler signal: more than the 2-link bare state. Every
  // user has at least Dashboard + Time + Settings once roleLoaded=true.
  await page
    .locator('aside[aria-label="Hauptnavigation"]')
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () => {
      const aside = document.querySelector('aside[aria-label="Hauptnavigation"]');
      if (!aside) return false;
      const links = aside.querySelectorAll("a[href]");
      return links.length >= 3;
    },
    null,
    { timeout: 15_000 },
  );
  // Brief settle so any in-flight roleLoaded re-render finishes before the
  // test snapshots the link list.
  await page.waitForTimeout(250);
}

export async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* about:blank or other unprivileged context */
    }
  });
}
