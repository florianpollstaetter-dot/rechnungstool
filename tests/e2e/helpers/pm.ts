// ORA-2783 — PM-MVP (SCH-825) board/table fixtures + native HTML5 drag helper.
//
// Seeds a pm-schema workspace + project + tasks so the M4/M5/M10/Perf specs
// have a deterministic board to drive. All DB access goes through an
// *authenticated* Supabase client (anon key + password sign-in), not the
// service-role client: the pm.* tables only GRANT to `authenticated`, and
// going through RLS mirrors exactly how the app creates this data. The
// workspace-insert trigger (pm.add_creator_as_admin) makes tenant.admin a
// workspace admin automatically; we add tenant.multi as a second member so
// the M10 realtime spec can prove cross-user propagation.
//
// Status column contract mirrors src/lib/pm/tasks.ts (kept in sync by hand —
// the tests tsconfig doesn't resolve the `@/` alias, so we don't import it).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { loadEnv } from "./env";
import type { TestTenant, TestUser } from "./test-tenant";

export const PM_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export type PmStatus = (typeof PM_STATUSES)[number];

export const PM_STATUS_LABEL: Record<PmStatus, string> = {
  todo: "To Do",
  in_progress: "In Arbeit",
  in_review: "Review",
  done: "Erledigt",
};

export interface SeededTask {
  id: string;
  title: string;
  status: PmStatus;
  priority: string;
}

export interface SeededPmBoard {
  workspaceId: string;
  projectId: string;
  workspaceSlug: string;
  boardPath: string;
  tablePath: string;
  tasks: SeededTask[];
  byStatus(status: PmStatus): SeededTask[];
  first(status: PmStatus): SeededTask;
}

async function authedClient(user: TestUser): Promise<SupabaseClient> {
  const env = loadEnv();
  const sb = createClient(env.supabaseUrl, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) {
    throw new Error(`authedClient sign-in failed for ${user.email}: ${error.message}`);
  }
  return sb;
}

/**
 * Seed a workspace + active project + 5 tasks spread across all four status
 * columns (2× todo, 1× in_progress, 1× in_review, 1× done). Returns the ids
 * and convenience selectors the specs use.
 */
export async function seedPmBoard(tenant: TestTenant): Promise<SeededPmBoard> {
  const admin = await authedClient(tenant.admin);
  try {
    const pm = admin.schema("pm");
    const slug = `qa-pm-${tenant.runId}`.slice(0, 63);

    const ws = await pm
      .from("workspaces")
      .insert({ name: `QA PM ${tenant.runId}`, slug, created_by: tenant.admin.authUserId })
      .select("id, slug")
      .single();
    if (ws.error || !ws.data) {
      throw new Error(`seedPmBoard.workspace failed: ${ws.error?.message ?? "no row"}`);
    }
    const workspaceId = (ws.data as { id: string }).id;

    // Second member so the M10 realtime spec can drive two distinct users.
    const memberInsert = await pm
      .from("workspace_members")
      .insert({ workspace_id: workspaceId, user_id: tenant.multi.authUserId, role: "member" });
    if (memberInsert.error) {
      throw new Error(`seedPmBoard.member failed: ${memberInsert.error.message}`);
    }

    const proj = await pm
      .from("projects")
      .insert({
        workspace_id: workspaceId,
        name: "QA Board Project",
        description: "ORA-2783 acceptance fixture",
        status: "active",
        created_by: tenant.admin.authUserId,
      })
      .select("id")
      .single();
    if (proj.error || !proj.data) {
      throw new Error(`seedPmBoard.project failed: ${proj.error?.message ?? "no row"}`);
    }
    const projectId = (proj.data as { id: string }).id;

    const rows = [
      { title: "QA Todo Alpha", status: "todo", position: 1, priority: "high" },
      { title: "QA Todo Beta", status: "todo", position: 2, priority: "medium" },
      { title: "QA Progress Gamma", status: "in_progress", position: 1, priority: "urgent" },
      { title: "QA Review Delta", status: "in_review", position: 1, priority: "low" },
      { title: "QA Done Epsilon", status: "done", position: 1, priority: "medium" },
    ].map((r) => ({
      ...r,
      project_id: projectId,
      parent_task_id: null,
      created_by: tenant.admin.authUserId,
    }));

    const inserted = await pm
      .from("tasks")
      .insert(rows)
      .select("id, title, status, priority");
    if (inserted.error || !inserted.data) {
      throw new Error(`seedPmBoard.tasks failed: ${inserted.error?.message ?? "no rows"}`);
    }
    const tasks = inserted.data as SeededTask[];

    return {
      workspaceId,
      projectId,
      workspaceSlug: slug,
      boardPath: `/pm/${workspaceId}/projects/${projectId}/board`,
      tablePath: `/pm/${workspaceId}/projects/${projectId}/table`,
      tasks,
      byStatus(status) {
        return tasks.filter((t) => t.status === status);
      },
      first(status) {
        const found = tasks.find((t) => t.status === status);
        if (!found) throw new Error(`seedPmBoard: no seeded task in status ${status}`);
        return found;
      },
    };
  } finally {
    await admin.auth.signOut().catch(() => undefined);
  }
}

/**
 * Delete the seeded workspace. ON DELETE CASCADE tears down projects, tasks,
 * and workspace_members. Call this in afterAll BEFORE destroyTenant, because
 * destroyTenant removes the auth users the pm rows reference.
 */
export async function destroyPmBoard(tenant: TestTenant, board: SeededPmBoard): Promise<void> {
  const admin = await authedClient(tenant.admin);
  try {
    const del = await admin
      .schema("pm")
      .from("workspaces")
      .delete()
      .eq("id", board.workspaceId);
    if (del.error) {
      throw new Error(`destroyPmBoard failed: ${del.error.message}`);
    }
  } finally {
    await admin.auth.signOut().catch(() => undefined);
  }
}

/**
 * Read a task's current status straight from the DB (RLS as tenant.admin) so
 * a spec can assert persistence independent of the rendered board.
 */
export async function readTaskStatus(tenant: TestTenant, taskId: string): Promise<PmStatus | null> {
  const admin = await authedClient(tenant.admin);
  try {
    const res = await admin
      .schema("pm")
      .from("tasks")
      .select("status")
      .eq("id", taskId)
      .maybeSingle();
    if (res.error) throw new Error(`readTaskStatus failed: ${res.error.message}`);
    return (res.data as { status: PmStatus } | null)?.status ?? null;
  } finally {
    await admin.auth.signOut().catch(() => undefined);
  }
}

/**
 * Perform a native HTML5 drag of a board card onto a target status column.
 *
 * Playwright's mouse-based dragTo() does NOT populate `dataTransfer`, which
 * the board's drop handler reads via getData(DRAG_MIME) — so we synthesize
 * the drag by dispatching real DragEvents that all share one DataTransfer
 * instance. The board's onDragStart writes the task id into that shared
 * object; onDragOver/onDrop then read it back, exactly as in a real drag.
 */
export async function nativeDragCardToColumn(
  page: Page,
  cardId: string,
  targetStatus: PmStatus,
): Promise<void> {
  await page.evaluate(
    ({ cardId, targetStatus }) => {
      const card = document.querySelector<HTMLElement>(`[data-board-card="${cardId}"]`);
      const column = document.querySelector<HTMLElement>(`[data-board-column="${targetStatus}"]`);
      if (!card) throw new Error(`drag: card [data-board-card="${cardId}"] not found`);
      if (!column) throw new Error(`drag: column [data-board-column="${targetStatus}"] not found`);

      const dataTransfer = new DataTransfer();
      const dispatch = (target: HTMLElement, type: string) => {
        const event = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer,
        });
        target.dispatchEvent(event);
      };

      dispatch(card, "dragstart");
      dispatch(column, "dragenter");
      dispatch(column, "dragover");
      dispatch(column, "drop");
      dispatch(card, "dragend");
    },
    { cardId, targetStatus },
  );
}
