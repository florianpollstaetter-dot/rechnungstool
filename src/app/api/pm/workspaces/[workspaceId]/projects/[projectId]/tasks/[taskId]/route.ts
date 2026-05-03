// SCH-825 M3 — Single task resource.
//
//   GET    /api/pm/workspaces/:wid/projects/:pid/tasks/:taskId
//   PATCH  /api/pm/workspaces/:wid/projects/:pid/tasks/:taskId
//   DELETE /api/pm/workspaces/:wid/projects/:pid/tasks/:taskId
//
// PATCH supports partial updates of title/description/assignee/due_date/
// priority/status/position. Reparenting (parent_task_id) is allowed but
// subject to the depth-1 trigger (returns 409 on violation).

import { requirePmSession } from "@/lib/pm/auth";
import {
  TASK_COLUMNS,
  isTaskPriority,
  isTaskStatus,
} from "@/lib/pm/tasks";

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ workspaceId: string; projectId: string; taskId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { projectId, taskId } = await params;

  const res = await session.sb
    .schema("pm")
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("project_id", projectId)
    .eq("id", taskId)
    .maybeSingle();

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data) {
    return Response.json({ error: "Aufgabe nicht gefunden" }, { status: 404 });
  }
  return Response.json({ task: res.data });
}

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ workspaceId: string; projectId: string; taskId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { projectId, taskId } = await params;

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        description?: string;
        assignee_user_id?: string | null;
        due_date?: string | null;
        priority?: string;
        status?: string;
        position?: number;
        parent_task_id?: string | null;
      }
    | null;

  const patch: Record<string, unknown> = {};

  if (body?.title !== undefined) {
    const title = body.title.trim();
    if (!title) {
      return Response.json({ error: "Titel darf nicht leer sein" }, { status: 400 });
    }
    patch.title = title;
  }
  if (body?.description !== undefined) {
    patch.description = body.description;
  }
  if (body?.assignee_user_id !== undefined) {
    patch.assignee_user_id = body.assignee_user_id || null;
  }
  if (body?.due_date !== undefined) {
    patch.due_date = body.due_date || null;
  }
  if (body?.priority !== undefined) {
    if (!isTaskPriority(body.priority)) {
      return Response.json({ error: "Ungültige Priorität" }, { status: 400 });
    }
    patch.priority = body.priority;
  }
  if (body?.status !== undefined) {
    if (!isTaskStatus(body.status)) {
      return Response.json({ error: "Ungültiger Status" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body?.position !== undefined) {
    if (typeof body.position !== "number" || !Number.isFinite(body.position)) {
      return Response.json({ error: "Ungültige Position" }, { status: 400 });
    }
    patch.position = body.position;
  }
  if (body?.parent_task_id !== undefined) {
    patch.parent_task_id = body.parent_task_id || null;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Keine Änderungen übermittelt" }, { status: 400 });
  }

  const res = await session.sb
    .schema("pm")
    .from("tasks")
    .update(patch)
    .eq("project_id", projectId)
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .maybeSingle();

  if (res.error) {
    if (res.error.message?.includes("Subtasks may only be one level deep")) {
      return Response.json({ error: res.error.message }, { status: 409 });
    }
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data) {
    return Response.json(
      { error: "Keine Berechtigung oder Aufgabe nicht gefunden" },
      { status: 403 },
    );
  }
  return Response.json({ task: res.data });
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: { params: Promise<{ workspaceId: string; projectId: string; taskId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { projectId, taskId } = await params;

  const res = await session.sb
    .schema("pm")
    .from("tasks")
    .delete()
    .eq("project_id", projectId)
    .eq("id", taskId)
    .select("id");

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data || res.data.length === 0) {
    return Response.json(
      { error: "Keine Berechtigung oder Aufgabe nicht gefunden" },
      { status: 403 },
    );
  }
  return Response.json({ deleted: true });
}
