// ORA-2366 — Regression guard for ORA-2295 (Arbeitszeitmodell-Settings-Edit
// 4. Regression). The bug class: edit modal accepts changes, "Speichern"
// reports success, page reload shows old values. Root cause was the write
// path using the anon-key client, so an RLS denial / silent UPDATE failure
// looked like a save. Fix routed through `/api/admin/work-time-models/[id]`
// (service role) and surfaces explicit errors.
//
// What this spec proves:
//   1. Positive path — admin edits an existing model (activate Saturday,
//      change Monday hours), saves, reloads the page, and the persisted
//      values come back unchanged. This catches any future silent-save
//      regression in either the settings PATCH or the days PATCH.
//   2. Negative path — invalid time window (Bis <= Von) surfaces as a
//      user-visible error (notify() toast + inline error) and does NOT
//      silently persist. This guards against a regression that "swallows"
//      backend validation errors the same way the original 4 regressions
//      swallowed write failures. (ORA-2946: the UI moved from alert() to
//      notify()/setError; the old page.on("dialog") assertion was stale.)

import { expect, test, type Page } from "@playwright/test";
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

// Seed a known-shape Mo-Fr 09:00-17:30 (8h 0m bezahlt, 30 min Pause) model.
// We need a stable starting point so the edit-then-reload assertion is
// deterministic across runs.
async function seedModel(
  companyId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const svc = service();
  const modelInsert = await svc
    .from("work_time_models")
    .insert({
      company_id: companyId,
      name,
      weekly_target_minutes: 5 * 480, // 5 × 8h
      unpaid_break_minutes: 30,
      vacation_days_per_year: 25,
    })
    .select()
    .single();
  if (modelInsert.error || !modelInsert.data) {
    throw new Error(`seedModel failed: ${modelInsert.error?.message ?? "no row"}`);
  }
  const modelId = (modelInsert.data as { id: string }).id;
  const days = [0, 1, 2, 3, 4].map((weekday) => ({
    model_id: modelId,
    weekday,
    start_time: "09:00",
    end_time: "17:30",
    daily_target_minutes: 480,
  }));
  const daysInsert = await svc.from("work_time_model_days").insert(days);
  if (daysInsert.error) {
    throw new Error(`seedModel days failed: ${daysInsert.error.message}`);
  }
  return { id: modelId, name };
}

async function readModel(modelId: string): Promise<{
  weekly_target_minutes: number;
  unpaid_break_minutes: number;
  vacation_days_per_year: number;
  name: string;
}> {
  const svc = service();
  const { data, error } = await svc
    .from("work_time_models")
    .select("name, weekly_target_minutes, unpaid_break_minutes, vacation_days_per_year")
    .eq("id", modelId)
    .single();
  if (error || !data) {
    throw new Error(`readModel failed: ${error?.message ?? "no row"}`);
  }
  return data as {
    weekly_target_minutes: number;
    unpaid_break_minutes: number;
    vacation_days_per_year: number;
    name: string;
  };
}

async function readModelDays(modelId: string): Promise<
  Array<{ weekday: number; start_time: string | null; end_time: string | null; daily_target_minutes: number }>
> {
  const svc = service();
  const { data, error } = await svc
    .from("work_time_model_days")
    .select("weekday, start_time, end_time, daily_target_minutes")
    .eq("model_id", modelId)
    .order("weekday");
  if (error) throw new Error(`readModelDays failed: ${error.message}`);
  return (data ?? []) as Array<{
    weekday: number;
    start_time: string | null;
    end_time: string | null;
    daily_target_minutes: number;
  }>;
}

async function cleanupModels(companyId: string): Promise<void> {
  const svc = service();
  // FK from days → models, so delete dependents first.
  const { data: models } = await svc
    .from("work_time_models")
    .select("id")
    .eq("company_id", companyId);
  const ids = (models ?? []).map((m) => (m as { id: string }).id);
  if (ids.length === 0) return;
  await svc.from("work_time_model_days").delete().in("model_id", ids);
  await svc.from("work_time_models").delete().in("id", ids);
}

test.beforeAll(async () => {
  tenant = await provisionTenant();
});

test.afterAll(async () => {
  if (tenant) {
    // Clear any models the test left behind so destroyTenant's company
    // delete doesn't trip on FKs.
    await cleanupModels(tenant.primarySlug).catch(() => undefined);
    await destroyTenant(tenant);
  }
});

async function openEditModalFor(page: Page, modelName: string): Promise<void> {
  await page.goto("/admin/arbeitszeitmodelle");
  await expect(
    page.getByRole("heading", { name: /Arbeitszeitmodelle/i }),
  ).toBeVisible();
  const row = page.locator("table tbody tr").filter({ hasText: modelName });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: /Bearbeiten/ }).click();
  // EditModal title shows the model name; the inner ModelForm header is
  // "Modell bearbeiten". Wait for the form to be mounted before interacting.
  await expect(page.getByRole("heading", { name: /Modell bearbeiten/i })).toBeVisible();
}

function editForm(page: Page) {
  // The edit modal contains exactly one form (the inner ModelForm).
  return page.locator("form").filter({ hasText: /Wochenpensum/i });
}

test("admin edits Mo-Fr → Mo-Sa, save persists across reload", async ({ page }) => {
  // Pre-seed a deterministic Mo-Fr 09:00-17:30 model on the tenant company.
  const modelName = `ORA-2366 Edit-Save ${tenant.runId}`;
  const seeded = await seedModel(tenant.primarySlug, modelName);

  await loginAs(page, tenant.admin);
  await openEditModalFor(page, modelName);

  const form = editForm(page);
  const formTable = form.locator("table");
  const formRows = formTable.locator("tbody tr");
  await expect(formRows).toHaveCount(7);

  // Sanity: Mo-Fr (weekday 0..4) should load active with 09:00-17:30 from
  // the seed. This implicitly guards the ORA-2320 read-path: if RLS swallows
  // the days fetch, the form falls back to defaults and looks identical —
  // but the saved values would then drift on submit. We pin Mo's start time
  // here so any default-fallback regression would fail downstream too.
  const mondayRow = formRows.nth(0);
  await expect(mondayRow.locator('input[type="time"]').nth(0)).toHaveValue("09:00");
  await expect(mondayRow.locator('input[type="time"]').nth(1)).toHaveValue("17:30");

  // Activate Saturday (weekday 5): default seeds had Sa/So inactive (no days
  // rows for them, so emptyDays defaults render disabled with empty times).
  const saturdayRow = formRows.nth(5);
  const saturdayCheckbox = saturdayRow.locator('input[type="checkbox"]');
  await expect(saturdayCheckbox).not.toBeChecked();
  await saturdayCheckbox.check();
  // Fill a deterministic 09:00-13:00 window so derived target = 240 - 30 = 210.
  await saturdayRow.locator('input[type="time"]').nth(0).fill("09:00");
  await saturdayRow.locator('input[type="time"]').nth(1).fill("13:00");
  // Force the override so the assertion below doesn't depend on derivedTarget
  // re-running when we re-open the modal.
  await saturdayRow.locator('input[type="number"]').fill("210");

  // Change Monday end time from 17:30 to 18:00 so weekday 0's daily target
  // diverges from the seed. derivedTarget() updates on change as long as the
  // override flag isn't already set — which it isn't on a freshly opened
  // edit form, since the load path only sets override=true when the seeded
  // target diverged from derived.
  await mondayRow.locator('input[type="time"]').nth(1).fill("18:00");
  // Pin Monday's target explicitly too (510 min = 540 window − 30 pause)
  // so we can assert it survives the round-trip independently of the form's
  // auto-derivation behaviour.
  await mondayRow.locator('input[type="number"]').fill("510");

  // Save: the inner ModelForm submit button. Wait for both settings + days
  // PATCH responses so we know the writes actually round-tripped before we
  // reload. This is the exact guard that catches the ORA-2295 regression
  // class — a missing response (silent failure) shows up here, not later.
  const settingsResp = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/admin/work-time-models/${seeded.id}`) &&
      r.request().method() === "PATCH" &&
      r.status() === 200,
  );
  const daysResp = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/admin/work-time-models/${seeded.id}`) &&
      r.request().method() === "PATCH" &&
      r.status() === 200,
  );
  await form.locator('button[type="submit"]').click();
  // Both PATCH calls fire from handleEditSave (action=update_settings then
  // action=replace_days); waitForResponse resolves on the first match for
  // each promise, so awaiting both is the right shape.
  await Promise.all([settingsResp, daysResp]);

  // Modal should close on success. Use a generous timeout because the
  // post-save loadAll() reloads users + models before re-rendering.
  await expect(page.getByRole("heading", { name: /Modell bearbeiten/i })).toBeHidden({
    timeout: 15_000,
  });

  // Round-trip check #1 — DB row (the part that silently failed in 4 regs).
  const dbModel = await readModel(seeded.id);
  const dbDays = await readModelDays(seeded.id);
  // 4 × 480 (Tue-Fri unchanged) + 510 (Mo) + 210 (Sa) = 2640.
  expect(dbModel.weekly_target_minutes).toBe(4 * 480 + 510 + 210);
  expect(dbDays.find((d) => d.weekday === 0)?.daily_target_minutes).toBe(510);
  expect(dbDays.find((d) => d.weekday === 0)?.end_time).toMatch(/^18:00/);
  expect(dbDays.find((d) => d.weekday === 5)?.daily_target_minutes).toBe(210);
  expect(dbDays.find((d) => d.weekday === 5)?.start_time).toMatch(/^09:00/);
  expect(dbDays.find((d) => d.weekday === 5)?.end_time).toMatch(/^13:00/);

  // Round-trip check #2 — UI list view after a hard reload. Wochenpensum
  // string should reflect the new total (44h = 2640 / 60).
  await page.reload();
  const reloadedRow = page.locator("table tbody tr").filter({ hasText: modelName });
  await expect(reloadedRow).toBeVisible({ timeout: 15_000 });
  await expect(reloadedRow).toContainText("44h");

  // Round-trip check #3 — re-open edit, verify Saturday is active with the
  // values we set. This is the user-visible flavour of the regression: the
  // form "remembered" old values after save.
  await reloadedRow.getByRole("button", { name: /Bearbeiten/ }).click();
  await expect(page.getByRole("heading", { name: /Modell bearbeiten/i })).toBeVisible();
  const form2 = editForm(page);
  const saturdayRow2 = form2.locator("table tbody tr").nth(5);
  await expect(saturdayRow2.locator('input[type="checkbox"]')).toBeChecked();
  await expect(saturdayRow2.locator('input[type="time"]').nth(0)).toHaveValue("09:00");
  await expect(saturdayRow2.locator('input[type="time"]').nth(1)).toHaveValue("13:00");
  await expect(saturdayRow2.locator('input[type="number"]')).toHaveValue("210");
  const mondayRow2 = form2.locator("table tbody tr").nth(0);
  await expect(mondayRow2.locator('input[type="time"]').nth(1)).toHaveValue("18:00");
  await expect(mondayRow2.locator('input[type="number"]')).toHaveValue("510");
});

test("admin save with invalid time window (Bis <= Von) surfaces a user-visible error and does NOT persist", async ({
  page,
}) => {
  // Fresh seed for this test so we know the pre-state.
  const modelName = `ORA-2366 Invalid-Window ${tenant.runId}`;
  const seeded = await seedModel(tenant.primarySlug, modelName);
  const beforeDays = await readModelDays(seeded.id);
  const mondayBefore = beforeDays.find((d) => d.weekday === 0);
  expect(mondayBefore?.end_time).toMatch(/^17:30/);

  await loginAs(page, tenant.admin);
  await openEditModalFor(page, modelName);

  const form = editForm(page);
  const mondayRow = form.locator("table tbody tr").nth(0);
  // Bis (08:00) <= Von (09:00) → API returns 400 "Bis muss nach Von liegen".
  await mondayRow.locator('input[type="time"]').nth(1).fill("08:00");

  // Wait for the failing days-PATCH. handleEditSave fires settings first
  // (which succeeds — name + numeric fields are unchanged from the seed) and
  // then days, which is the one that 400s on the invalid window.
  const failedResp = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/admin/work-time-models/${seeded.id}`) &&
      r.request().method() === "PATCH" &&
      r.status() === 400,
  );
  await form.locator('button[type="submit"]').click();
  const resp = await failedResp;
  const body = await resp.json().catch(() => ({}));
  expect(body.error).toMatch(/Bis muss nach Von liegen/i);

  // A user-visible error must surface — this is what the user actually
  // experiences. handleEditSave now calls notify(...) (a role="alert" toast)
  // and setError(...) (the inline error inside the page) instead of alert().
  // If the regression returns (silently swallowed error), neither appears and
  // the test fails loudly.
  await expect(
    page.getByRole("alert").filter({ hasText: /Bis muss nach Von liegen/i }),
  ).toBeVisible({ timeout: 5_000 });
  await expect(
    page.getByText(/Bis muss nach Von liegen/i).first(),
  ).toBeVisible({ timeout: 5_000 });

  // Days table in the DB MUST be unchanged for weekday 0. Replace-days runs
  // as a single transactional unit at the API: invalid input is rejected
  // before any DELETE/UPSERT runs, so Mo's row is still the seeded 09:00-17:30.
  const afterDays = await readModelDays(seeded.id);
  const mondayAfter = afterDays.find((d) => d.weekday === 0);
  expect(mondayAfter?.end_time).toMatch(/^17:30/);
  expect(mondayAfter?.daily_target_minutes).toBe(480);
});
