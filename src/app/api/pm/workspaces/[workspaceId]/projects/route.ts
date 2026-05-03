// SCH-825 M2 — Project collection (per workspace).
//
//   GET  /api/pm/workspaces/:workspaceId/projects
//   POST /api/pm/workspaces/:workspaceId/projects
//
// RLS handles tenant isolation: pm.is_workspace_member() filters everything.

import { requirePmSession } from "@/lib/pm/auth";

const PROJECT_STATUSES = ["planned", "active", "on_hold", "done"] as const;
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

function isStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId } = await params;

  const res = await session.sb
    .schema("pm")
    .from("projects")
    .select("id, workspace_id, name, description, status, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  return Response.json({ projects: res.data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId } = await params;

  const body = (await request.json().catch(() => null)) as
    | { name?: string; description?: string; status?: string }
    | null;

  const name = body?.name?.trim();
  if (!name) {
    return Response.json({ error: "Name ist erforderlich" }, { status: 400 });
  }
  const description = body?.description?.trim() ?? "";
  const status: ProjectStatus = isStatus(body?.status) ? body.status : "planned";

  const res = await session.sb
    .schema("pm")
    .from("projects")
    .insert({
      workspace_id: workspaceId,
      name,
      description,
      status,
      created_by: session.user.id,
    })
    .select("id, workspace_id, name, description, status, created_by, created_at, updated_at")
    .single();

  if (res.error) {
    // RLS denies the INSERT for non-members → Postgres returns code 42501 / a
    // generic permission error. Surface as 403 so the UI can show a helpful
    // message instead of a 500.
    const status =
      res.error.code === "42501" || res.error.message?.toLowerCase().includes("policy")
        ? 403
        : 500;
    return Response.json({ error: res.error.message }, { status });
  }
  return Response.json({ project: res.data }, { status: 201 });
}
