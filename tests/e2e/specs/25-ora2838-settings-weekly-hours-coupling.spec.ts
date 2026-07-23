// ORA-2838 (ORA-2837 M2) — Regression guard for the work-model weekly-hours
// coupling shipped in 865dad6.
//
// The coupling: when an admin edits an employee's per-user Raster in the
// Zeiterfassung → Einstellungen tab, `replaceUserWorkSchedules` recomputes the
// underlying Arbeitszeitmodell's `weekly_target_minutes` from the saved day
// grid. Before the fix, the model's "Wochenstunden" drifted from the grid: the
// day rows changed but weekly_target_minutes stayed stale, so /admin/
// arbeitszeitmodelle showed the old total.
//
// What this spec proves, end-to-end (real browser + RLS, not just unit math):
//   1. Editing a day's target in the settings-tab schedule modal and saving
//      updates the model's weekly_target_minutes to the new grid sum in the DB.
//      This also implicitly guards the anon-key admin write path (RLS policy
//      wtm_admin_modify — the path that silently failed in ORA-2295).
//   2. The /admin/arbeitszeitmodelle list view reflects the new Wochenstunden
//      after a reload — the user-visible flavour of the drift bug.

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  provisionTenant,
  destroyTenant,
  type TestTenant,
} from "../helpers/test-tenant";
import { loginAs } from "../helpers/auth";
import { loadEnv } from "../helpers/env";

let tenant: TestTenant;

function service(): SupabaseClient {
  const env = loadEnv();
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Seed a Mo-Fr 8h (480 min) model — weekly_target_minutes = 2400 (40h) — and
// assign it to the given employee via user_profiles.work_time_model_id. No
// start/end times: the settings modal renders Mo-Fr enabled from the daily
// targets alone, which keeps the edit deterministic (only the number field
// we touch changes).
async function seedAssignedModel(
  companyId: string,
  authUserId: string,
  name: string,
): Promise<string> {
  const svc = service();
  const modelInsert = await svc
    .from("work_time_models")
    .insert({
      company_id: companyId,
      name,
      weekly_target_minutes: 5 * 480,
      unpaid_break_minutes: 30,
      vacation_days_per_year: 25,
    })
    .select()
    .single();
  if (modelInsert.error || !modelInsert.data) {
    throw new Error(`seedAssignedModel failed: ${modelInsert.error?.message ?? "no row"}`);
  }
  const modelId = (modelInsert.data as { id: string }).id;

  const days = [0, 1, 2, 3, 4].map((weekday) => ({
    model_id: modelId,
    weekday,
    daily_target_minutes: 480,
  }));
  const daysInsert = await svc.from("work_time_model_days").insert(days);
  if (daysInsert.error) {
    throw new Error(`seedAssignedModel days failed: ${daysInsert.error.message}`);
  }

  const assign = await svc
    .from("user_profiles")
    .update({ work_time_model_id: modelId })
    .eq("auth_user_id", authUserId);
  if (assign.error) {
    throw new Error(`seedAssignedModel assign failed: ${assign.error.message}`);
  }
  return modelId;
}

async function readWeeklyTarget(modelId: string): Promise<number> {
  const svc = service();
  const { data, error } = await svc
    .from("work_time_models")
    .select("weekly_target_minutes")
    .eq("id", modelId)
    .single();
  if (error || !data) {
    throw new Error(`readWeeklyTarget failed: ${error?.message ?? "no row"}`);
  }
  return Number((data as { weekly_target_minutes: number }).weekly_target_minutes);
}

async function cleanupModels(companyId: string): Promise<void> {
  const svc = service();
  const { data: models } = await svc
    .from("work_time_models")
    .select("id")
    .eq("company_id", companyId);
  const ids = (models ?? []).map((m) => (m as { id: string }).id);
  if (ids.length === 0) return;
  // Un-assign so the profile FK doesn't block the model delete.
  await svc.from("user_profiles").update({ work_time_model_id: null }).in("work_time_model_id", ids);
  await svc.from("work_time_model_days").delete().in("model_id", ids);
  await svc.from("work_time_models").delete().in("id", ids);
}

test.beforeAll(async () => {
  tenant = await provisionTenant();
});

test.afterAll(async () => {
  if (tenant) {
    await cleanupModels(tenant.primarySlug).catch(() => undefined);
    await destroyTenant(tenant);
  }
});

test("settings-tab schedule edit recomputes the model's weekly hours (grid coupling)", async ({
  page,
}) => {
  const modelName = `ORA-2838 Coupling ${tenant.runId}`;
  const employee = tenant.rechnOnly; // display_name "QA Rechn Only"
  const modelId = await seedAssignedModel(tenant.primarySlug, employee.authUserId, modelName);
  expect(await readWeeklyTarget(modelId)).toBe(5 * 480); // 40h baseline

  await loginAs(page, tenant.admin);

  // Open the admin-only Zeiterfassung → Einstellungen tab directly via URL.
  await page.goto("/time?view=settings");
  const employeeRow = page
    .locator("table tbody tr")
    .filter({ hasText: employee.displayName });
  await expect(employeeRow).toBeVisible({ timeout: 15_000 });

  // Open the per-user schedule (Arbeitszeitmodell) editor.
  await employeeRow.getByRole("button", { name: /Zeitmodell/ }).click();
  await expect(
    page.getByRole("heading", { name: /Arbeitszeitmodell —/ }),
  ).toBeVisible();

  // ORA-2946 — scope to the schedule modal's overlay (`fixed inset-0 … z-50`)
  // instead of a bare `.fixed`. Bare `.fixed` also matched the always-present
  // floating "Hilfe" button (`fixed bottom-5 right-5`) — and, since ORA-2918,
  // the cookie-consent card (now suppressed in loginAs). Anchoring on the modal
  // heading keeps the locator resolving to exactly one element.
  const modal = page
    .locator("div.fixed.inset-0")
    .filter({ has: page.getByRole("heading", { name: /Arbeitszeitmodell —/ }) });

  const modalRows = modal.locator("table tbody tr");
  await expect(modalRows).toHaveCount(7);

  // Monday (weekday 0) seeds at 480. Bump it to 600 → new week total is
  // 600 + 4×480 = 2520 (42h).
  const mondayTarget = modalRows.nth(0).locator('input[type="number"]');
  await expect(mondayTarget).toHaveValue("480");
  await mondayTarget.fill("600");

  // The modal's live Wochenpensum total should reflect the change before save.
  await expect(modal).toContainText("42h");

  await page.getByRole("button", { name: /^Speichern$/ }).click();
  await expect(modal).toContainText(/Gespeichert/i, { timeout: 10_000 });

  // Round-trip check #1 — the coupling wrote the new grid sum to the model.
  await expect
    .poll(() => readWeeklyTarget(modelId), { timeout: 10_000 })
    .toBe(600 + 4 * 480);

  // Round-trip check #2 — the admin Arbeitszeitmodelle list shows 42h, i.e.
  // the "Wochenstunden" no longer drifts from the edited per-user grid.
  await page.goto("/admin/arbeitszeitmodelle");
  const adminRow = page.locator("table tbody tr").filter({ hasText: modelName });
  await expect(adminRow).toBeVisible({ timeout: 15_000 });
  await expect(adminRow).toContainText("42h");
});
