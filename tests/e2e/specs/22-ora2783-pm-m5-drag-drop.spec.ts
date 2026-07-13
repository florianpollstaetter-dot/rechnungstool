// ORA-2783 / SCH-825 M5 — Drag-&-Drop zwischen Status-Spalten.
//
// Acceptance (Florian M5): dragging a card from one status column to another
// moves the card (optimistic UI after router.refresh) AND persists the new
// status (PATCH /api/pm/.../tasks/{id} with { status, position }). Same-column
// drops are intentional no-ops in M5.
//
// The board uses native HTML5 DnD (dataTransfer + MIME
// "application/x-pm-task-id"), which Playwright's mouse dragTo() can't drive —
// see nativeDragCardToColumn() in helpers/pm.ts for the shared-DataTransfer
// synthesis.
//
// Runtime-gated: needs a running app + Supabase (blocked on ORA-2530).

import { expect, test } from "@playwright/test";
import { provisionTenant, destroyTenant, type TestTenant } from "../helpers/test-tenant";
import { loginAs } from "../helpers/auth";
import {
  seedPmBoard,
  destroyPmBoard,
  nativeDragCardToColumn,
  readTaskStatus,
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

test("M5 — dragging a card across columns moves it and persists the new status", async ({ page }) => {
  const task = board.first("todo");

  await loginAs(page, tenant.admin);
  await page.goto(board.boardPath);

  const cardInTodo = page.locator(`[data-board-column="todo"] [data-board-card="${task.id}"]`);
  await expect(cardInTodo).toBeVisible();

  await nativeDragCardToColumn(page, task.id, "in_progress");

  // Optimistic update: after router.refresh the card is rendered under the
  // in_progress column with its status attribute flipped.
  const cardInProgress = page.locator(
    `[data-board-column="in_progress"] [data-board-card="${task.id}"]`,
  );
  await expect(cardInProgress).toBeVisible();
  await expect(cardInProgress).toHaveAttribute("data-board-card-status", "in_progress");
  await expect(cardInTodo).toHaveCount(0);

  // Persistence: the DB row reflects the move, not just the DOM.
  expect(await readTaskStatus(tenant, task.id)).toBe("in_progress");
});

test("M5 — moved card survives a full page reload (server-side persistence)", async ({ page }) => {
  const task = board.first("in_review");

  await loginAs(page, tenant.admin);
  await page.goto(board.boardPath);

  await expect(
    page.locator(`[data-board-column="in_review"] [data-board-card="${task.id}"]`),
  ).toBeVisible();

  await nativeDragCardToColumn(page, task.id, "done");
  await expect(
    page.locator(`[data-board-column="done"] [data-board-card="${task.id}"]`),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.locator(`[data-board-column="done"] [data-board-card="${task.id}"]`),
  ).toBeVisible();
  expect(await readTaskStatus(tenant, task.id)).toBe("done");
});
