// ORA-2783 / SCH-825 M10 — Realtime.
//
// Acceptance (Florian M10): a task change made by user A appears for user B
// in under one second, without a manual reload. Driven with two independent
// browser contexts (distinct users, distinct cookies) both viewing the same
// project board; the board subscribes to Supabase postgres_changes on
// pm.tasks and calls router.refresh() on any event.
//
// Context A = tenant.admin (workspace admin), Context B = tenant.multi
// (seeded as a workspace member by seedPmBoard).
//
// Runtime-gated: needs a running app + Supabase realtime (blocked on
// ORA-2530).

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { provisionTenant, destroyTenant, type TestTenant } from "../helpers/test-tenant";
import { loginAs } from "../helpers/auth";
import { seedPmBoard, destroyPmBoard, type SeededPmBoard } from "../helpers/pm";

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

async function openBoardAs(
  browser: Browser,
  user: TestTenant["admin"],
  boardPath: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, user);
  await page.goto(boardPath);
  return { context, page };
}

test("M10 — a status change in context A appears in context B in under 1s", async ({ browser }) => {
  const task = board.first("todo");
  const target = "done" as const;

  const a = await openBoardAs(browser, tenant.admin, board.boardPath);
  const b = await openBoardAs(browser, tenant.multi, board.boardPath);

  try {
    // Both contexts must have the task in its original column (and thus an
    // active realtime subscription) before we mutate.
    await expect(
      a.page.locator(`[data-board-column="todo"] [data-board-card="${task.id}"]`),
    ).toBeVisible();
    await expect(
      b.page.locator(`[data-board-column="todo"] [data-board-card="${task.id}"]`),
    ).toBeVisible();

    const cardInB = b.page.locator(
      `[data-board-column="${target}"] [data-board-card="${task.id}"]`,
    );

    const startedAt = Date.now();
    await a.page
      .locator(`[data-board-card="${task.id}"] select[aria-label="Status ändern"]`)
      .selectOption(target);

    // Generous ceiling to distinguish "never propagated" from "propagated
    // slowly" — the acceptance gate is the elapsed assertion below.
    await cardInB.waitFor({ state: "visible", timeout: 5_000 });
    const elapsedMs = Date.now() - startedAt;

    expect(
      elapsedMs,
      `M10 realtime propagation was ${elapsedMs}ms; acceptance target is <1000ms`,
    ).toBeLessThan(1_000);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
