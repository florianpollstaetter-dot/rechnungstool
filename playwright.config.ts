import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

// SCH-976 — local runs autoload .env.local so the suite can pick up the
// Supabase service-role key without a separate `source .env.local` step.
// CI sets the same vars via repo secrets and never reads this file.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

// SCH-976 — K2-γ QA Playwright suite. Targets:
//   * Local dev server when BASE_URL is unset (npm run dev → http://localhost:3000).
//   * A Vercel preview / live tenant when BASE_URL points elsewhere — CI uses
//     this to run against a deployed environment without rebuilding.
//
// Setup expects three Supabase secrets in the environment (.env.local for
// local runs, GitHub Actions secrets for CI):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY.
// The service-role key is required because the test fixture provisions a
// fresh `qa-perms-<run>` tenant and 4 users via direct table inserts before
// the suite, then purges them after — same path the app uses for register-
// company / DELETE /api/admin/users.
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// ORA-2286 — Vercel preview deployments are SSO-gated by Deployment Protection.
// When CI resolves a PR's preview URL and exports VERCEL_AUTOMATION_BYPASS_SECRET,
// inject the bypass header on every HTTP request the browser issues (navigations,
// XHR, fetch, asset loads) so Playwright reaches the app instead of the SSO wall.
// The `samesitenone` cookie hint lets Vercel persist the bypass for subsequent
// requests in the same browser context.
const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHTTPHeaders = vercelBypass
  ? {
      "x-vercel-protection-bypass": vercelBypass,
      "x-vercel-set-bypass-cookie": "samesitenone",
    }
  : undefined;

export default defineConfig({
  testDir: "./tests/e2e/specs",
  outputDir: "./tests/e2e/.artifacts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "de-AT",
    timezoneId: "Europe/Vienna",
    extraHTTPHeaders,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
