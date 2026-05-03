// SCH-825 M3 — Task collection (per project).
//
//   GET  /api/pm/workspaces/:workspaceId/projects/:projectId/tasks
//   POST /api/pm/workspaces/:workspaceId/projects/:projectId/tasks
//
// RLS handles tenant isolation: pm.tasks policies resolve workspace
// membership through pm.task_workspace_id().

import { requirePmSession } from "@/lib/pm/auth";
import {
  TASK_COLUMNS,
  isTaskPriority,
  isTaskStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/pm/tasks";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; projectId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { projectId } = await params;

  const res = await session.sb
    .schema("pm")
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("project_id", projectId)
    // Default ordering: status, then position. Board view (M4) groups by
    // status; the position index makes this scan composite-cheap.
    .order("status", { ascending: true })
    .order("position", { ascending: true });

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  return Response.json({ tasks: res.data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; projectId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { projectId } = await params;

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        description?: string;
        assignee_user_id?: string | null;
        due_date?: string | null;
        priority?: string;
        status?: string;
        parent_task_id?: string | null;
      }
    | null;

  const title = body?.title?.trim();
  if (!title) {
    return Response.json({ error: "Titel ist erforderlich" }, { status: 400 });
  }

  const priority: TaskPriority = isTaskPriority(body?.priority)
    ? body.priority
    : "medium";
  const status: TaskStatus = isTaskStatus(body?.status) ? body.status : "todo";

  const insert: Record<string, unknown> = {
    project_id: projectId,
    title,
    description: body?.description?.trim() ?? "",
    priority,
    status,
    created_by: session.user.id,
  };

  if (body?.assignee_user_id !== undefined) {
    insert.assignee_user_id = body.assignee_user_id || null;
  }
  if (body?.due_date !== undefined) {
    insert.due_date = body.due_date || null;
  }
  if (body?.parent_task_id !== undefined) {
    insert.parent_task_id = body.parent_task_id || null;
  }

  const res = await session.sb
    .schema("pm")
    .from("tasks")
    .insert(insert)
    .select(TASK_COLUMNS)
    .single();

  if (res.error) {
    // RLS denial → 403; subtask-depth trigger → 409 (conflict-ish).
    const code = res.error.code;
    let httpStatus = 500;
    if (code === "42501" || res.error.message?.toLowerCase().includes("policy")) {
      httpStatus = 403;
    } else if (
      res.error.message?.includes("Subtasks may only be one level deep")
    ) {
      httpStatus = 409;
    }
    return Response.json({ error: res.error.message }, { status: httpStatus });
  }
  return Response.json({ task: res.data }, { status: 201 });
}
