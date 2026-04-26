// SCH-825 M1 — Workspaces collection.
//
//   GET  /api/pm/workspaces        → workspaces the caller is a member of
//   POST /api/pm/workspaces        → create new workspace (caller becomes admin)
//
// RLS handles tenant isolation: pm.is_workspace_member() filters SELECTs,
// the INSERT policy + trigger pm.add_creator_as_admin() ensures the creator
// is seeded as admin atomically.

import { requirePmSession } from "@/lib/pm/auth";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

export async function GET() {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const res = await session.sb
    .schema("pm")
    .from("workspaces")
    .select("id, name, slug, created_by, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  return Response.json({ workspaces: res.data ?? [] });
}

export async function POST(request: Request) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const body = (await request.json().catch(() => null)) as
    | { name?: string; slug?: string }
    | null;

  const name = body?.name?.trim();
  const slug = body?.slug?.trim().toLowerCase();

  if (!name) {
    return Response.json({ error: "Name ist erforderlich" }, { status: 400 });
  }
  if (!slug || !SLUG_RE.test(slug)) {
    return Response.json(
      {
        error:
          "Slug muss 2–63 Zeichen lang sein, mit a–z/0–9 starten und nur a–z, 0–9 oder Bindestriche enthalten",
      },
      { status: 400 },
    );
  }

  const res = await session.sb
    .schema("pm")
    .from("workspaces")
    .insert({ name, slug, created_by: session.user.id })
    .select("id, name, slug, created_by, created_at, updated_at")
    .single();

  if (res.error) {
    const status = res.error.code === "23505" ? 409 : 500;
    const message =
      status === 409
        ? "Slug ist bereits vergeben"
        : res.error.message;
    return Response.json({ error: message }, { status });
  }
  return Response.json({ workspace: res.data }, { status: 201 });
}
