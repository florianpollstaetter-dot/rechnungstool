// SCH-825 M1 — Workspace single-resource.
//
//   GET    /api/pm/workspaces/:workspaceId
//   PATCH  /api/pm/workspaces/:workspaceId   (admin via RLS)
//   DELETE /api/pm/workspaces/:workspaceId   (admin via RLS)

import { requirePmSession } from "@/lib/pm/auth";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId } = await params;

  const res = await session.sb
    .schema("pm")
    .from("workspaces")
    .select("id, name, slug, created_by, created_at, updated_at")
    .eq("id", workspaceId)
    .maybeSingle();

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data) {
    return Response.json({ error: "Workspace nicht gefunden" }, { status: 404 });
  }
  return Response.json({ workspace: res.data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId } = await params;

  const body = (await request.json().catch(() => null)) as
    | { name?: string; slug?: string }
    | null;

  const patch: Record<string, string> = {};
  if (body?.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return Response.json({ error: "Name darf nicht leer sein" }, { status: 400 });
    }
    patch.name = name;
  }
  if (body?.slug !== undefined) {
    const slug = body.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return Response.json({ error: "Slug-Format ungültig" }, { status: 400 });
    }
    patch.slug = slug;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Keine Änderungen übermittelt" }, { status: 400 });
  }

  const res = await session.sb
    .schema("pm")
    .from("workspaces")
    .update(patch)
    .eq("id", workspaceId)
    .select("id, name, slug, created_by, created_at, updated_at")
    .maybeSingle();

  if (res.error) {
    const status = res.error.code === "23505" ? 409 : 500;
    const message =
      status === 409 ? "Slug ist bereits vergeben" : res.error.message;
    return Response.json({ error: message }, { status });
  }
  // RLS-deny → 0 rows updated, returns null. Treat as 403.
  if (!res.data) {
    return Response.json(
      { error: "Keine Berechtigung oder Workspace nicht gefunden" },
      { status: 403 },
    );
  }
  return Response.json({ workspace: res.data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId } = await params;

  // We need to know whether the row existed AND we had permission. Use the
  // returning select to disambiguate "RLS denied" (0 rows) from real errors.
  const res = await session.sb
    .schema("pm")
    .from("workspaces")
    .delete()
    .eq("id", workspaceId)
    .select("id");

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data || res.data.length === 0) {
    return Response.json(
      { error: "Keine Berechtigung oder Workspace nicht gefunden" },
      { status: 403 },
    );
  }
  return Response.json({ deleted: true });
}
