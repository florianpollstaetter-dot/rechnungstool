// ORA-2783 / SCH-825 — Perf (grobe Lade-Assertion).
//
// Acceptance (Florian, rough): the board and table views load in a
// reasonable time on a seeded project. This is a coarse ceiling, not a
// micro-benchmark — it guards against gross regressions (N+1 fetches, an
// accidental full-table scan) rather than fixing an exact budget. The
// elapsed time is recorded via console so the ORA-2782 run can tighten the
// threshold against real staging numbers.
//
// Runtime-gated: needs a running app + Supabase (blocked on ORA-2530).

import { expect, test } from "@playwright/test";
import { provisionTenant, destroyTenant, type TestTenant } from "../helpers/test-tenant";
import { loginAs } from "../helpers/auth";
import { seedPmBoard, destroyPmBoard, type SeededPmBoard } from "../helpers/pm";

// Coarse ceiling. CI runs against a dev/preview build, so this is generous;
// tighten in ORA-2782 once staging p95 numbers exist.
const LOAD_BUDGET_MS = 4_000;

let tenant: TestTenant;
let board: SeededPmBoard;

test.beforeAll(async () => {
  tenant = await provisionTenant();
  board = await seedPmBoard(tenant);
});

test.afterAll(async () => {
  if (board) await destroyPmBoard(tenant, board);
  if (tenant) await destroyTenant(tenant);
});

test("Perf — board view renders its columns within the load budget", async ({ page }) => {
  await loginAs(page, tenant.admin);

  const startedAt = Date.now();
  await page.goto(board.boardPath, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-board-column="todo"]')).toBeVisible();
  // First card visible = data actually rendered, not just an empty shell.
  await expect(page.locator("[data-board-card]").first()).toBeVisible();
  const elapsedMs = Date.now() - startedAt;

  console.log(`[perf] board load: ${elapsedMs}ms (budget ${LOAD_BUDGET_MS}ms)`);
  expect(elapsedMs, `board load ${elapsedMs}ms exceeded ${LOAD_BUDGET_MS}ms budget`).toBeLessThan(
    LOAD_BUDGET_MS,
  );
});

test("Perf — table view renders its rows within the load budget", async ({ page }) => {
  await loginAs(page, tenant.admin);

  const startedAt = Date.now();
  await page.goto(board.tablePath, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-pm-table]")).toBeVisible();
  await expect(page.locator("[data-table-row]").first()).toBeVisible();
  const elapsedMs = Date.now() - startedAt;

  console.log(`[perf] table load: ${elapsedMs}ms (budget ${LOAD_BUDGET_MS}ms)`);
  expect(elapsedMs, `table load ${elapsedMs}ms exceeded ${LOAD_BUDGET_MS}ms budget`).toBeLessThan(
    LOAD_BUDGET_MS,
  );
});
