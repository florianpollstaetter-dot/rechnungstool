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

// ORA-2286: when CI targets a Vercel preview with Deployment Protection
// enabled, every request needs the bypass secret so Playwright isn't
// redirected to the Vercel auth wall. Set VERCEL_PROTECTION_BYPASS in the
// workflow (injected from the VERCEL_PROTECTION_BYPASS repo secret).
const extraHTTPHeaders: Record<string, string> = process.env.VERCEL_PROTECTION_BYPASS
  ? { "x-vercel-protection-bypass": process.env.VERCEL_PROTECTION_BYPASS }
  : {};

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
    extraHTTPHeaders,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "de-AT",
    timezoneId: "Europe/Vienna",
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
