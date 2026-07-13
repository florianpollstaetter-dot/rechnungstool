// ORA-2783 / SCH-825 M4 — Board-Ansicht acceptance.
//
// Acceptance (Florian M4): the Kanban board renders one column per status
// (todo / in_progress / in_review / done) and each seeded task appears as a
// card in the column matching its status.
//
// Runtime-gated: this suite needs a running app + Supabase (blocked on
// ORA-2530). Authored pre-staging per ORA-2783 so the run is turnkey.

import { expect, test } from "@playwright/test";
import { provisionTenant, destroyTenant, type TestTenant } from "../helpers/test-tenant";
import { loginAs } from "../helpers/auth";
import {
  seedPmBoard,
  destroyPmBoard,
  PM_STATUSES,
  PM_STATUS_LABEL,
  type SeededPmBoard,
} from "../helpers/pm";

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

test("M4 — board renders one column per status with correct labels", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto(board.boardPath);

  for (const status of PM_STATUSES) {
    const column = page.locator(`[data-board-column="${status}"]`);
    await expect(column).toBeVisible();
    await expect(column.locator("h2")).toHaveText(PM_STATUS_LABEL[status]);
  }
});

test("M4 — each seeded task is a card in the column matching its status", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto(board.boardPath);

  for (const task of board.tasks) {
    const card = page.locator(
      `[data-board-column="${task.status}"] [data-board-card="${task.id}"]`,
    );
    await expect(card).toBeVisible();
    await expect(card).toContainText(task.title);
    await expect(card).toHaveAttribute("data-board-card-status", task.status);
  }
});

test("M4 — column header count matches the number of cards in it", async ({ page }) => {
  await loginAs(page, tenant.admin);
  await page.goto(board.boardPath);

  for (const status of PM_STATUSES) {
    const expected = board.byStatus(status).length;
    const column = page.locator(`[data-board-column="${status}"]`);
    // Header count badge is the <span> in the column header.
    await expect(column.locator("header span")).toHaveText(String(expected));
    await expect(column.locator("[data-board-card]")).toHaveCount(expected);
  }
});
