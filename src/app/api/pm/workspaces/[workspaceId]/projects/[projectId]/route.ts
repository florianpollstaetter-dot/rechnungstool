// SCH-825 M2 — Single project resource.
//
//   GET    /api/pm/workspaces/:workspaceId/projects/:projectId
//   PATCH  /api/pm/workspaces/:workspaceId/projects/:projectId  (member via RLS)
//   DELETE /api/pm/workspaces/:workspaceId/projects/:projectId  (admin via RLS)

import { requirePmSession } from "@/lib/pm/auth";

const PROJECT_STATUSES = ["planned", "active", "on_hold", "done"] as const;
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

function isStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; projectId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId, projectId } = await params;

  const res = await session.sb
    .schema("pm")
    .from("projects")
    .select("id, workspace_id, name, description, status, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("id", projectId)
    .maybeSingle();

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data) {
    return Response.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }
  return Response.json({ project: res.data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; projectId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId, projectId } = await params;

  const body = (await request.json().catch(() => null)) as
    | { name?: string; description?: string; status?: string }
    | null;

  const patch: Record<string, string> = {};
  if (body?.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return Response.json({ error: "Name darf nicht leer sein" }, { status: 400 });
    }
    patch.name = name;
  }
  if (body?.description !== undefined) {
    patch.description = body.description;
  }
  if (body?.status !== undefined) {
    if (!isStatus(body.status)) {
      return Response.json({ error: "Ungültiger Status" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Keine Änderungen übermittelt" }, { status: 400 });
  }

  const res = await session.sb
    .schema("pm")
    .from("projects")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("id", projectId)
    .select("id, workspace_id, name, description, status, created_by, created_at, updated_at")
    .maybeSingle();

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data) {
    return Response.json(
      { error: "Keine Berechtigung oder Projekt nicht gefunden" },
      { status: 403 },
    );
  }
  return Response.json({ project: res.data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; projectId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId, projectId } = await params;

  const res = await session.sb
    .schema("pm")
    .from("projects")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", projectId)
    .select("id");

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data || res.data.length === 0) {
    return Response.json(
      { error: "Keine Berechtigung oder Projekt nicht gefunden" },
      { status: 403 },
    );
  }
  return Response.json({ deleted: true });
}
