// SCH-825 M1 — Workspace member single-resource.
//
//   PATCH  /api/pm/workspaces/:workspaceId/members/:userId   (admin)
//   DELETE /api/pm/workspaces/:workspaceId/members/:userId   (admin OR self)
//
// "Self-leave" is enforced in the RLS DELETE policy
// (`pm.is_workspace_admin(workspace_id) OR user_id = auth.uid()`).

import { requirePmSession } from "@/lib/pm/auth";

const VALID_ROLES = new Set(["admin", "member", "guest"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; userId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId, userId } = await params;

  const body = (await request.json().catch(() => null)) as
    | { role?: string }
    | null;

  const role = body?.role?.trim();
  if (!role || !VALID_ROLES.has(role)) {
    return Response.json(
      { error: "Rolle muss admin, member oder guest sein" },
      { status: 400 },
    );
  }

  const res = await session.sb
    .schema("pm")
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("workspace_id, user_id, role, invited_by, created_at")
    .maybeSingle();

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data) {
    return Response.json(
      { error: "Keine Berechtigung oder Member nicht gefunden" },
      { status: 403 },
    );
  }
  return Response.json({ member: res.data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; userId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId, userId } = await params;

  const res = await session.sb
    .schema("pm")
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("user_id");

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data || res.data.length === 0) {
    return Response.json(
      { error: "Keine Berechtigung oder Member nicht gefunden" },
      { status: 403 },
    );
  }
  return Response.json({ deleted: true });
}
