// SCH-825 M1 — Workspace members collection.
//
//   GET  /api/pm/workspaces/:workspaceId/members
//   POST /api/pm/workspaces/:workspaceId/members   (admin via RLS)
//
// Invite-by-email: MVP requires the invitee to already have an Orange-Octo /
// Supabase auth account (SSO). If the email is unknown we return 404 with a
// hint — Phase 2 adds magic-link signup invites.

import { requirePmSession, pmServiceClient } from "@/lib/pm/auth";

const VALID_ROLES = new Set(["admin", "member", "guest"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId } = await params;

  const membersRes = await session.sb
    .schema("pm")
    .from("workspace_members")
    .select("workspace_id, user_id, role, invited_by, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (membersRes.error) {
    return Response.json({ error: membersRes.error.message }, { status: 500 });
  }

  const rows = membersRes.data ?? [];
  if (rows.length === 0) {
    return Response.json({ members: [] });
  }

  // Resolve display info via service-role auth.admin (RLS-bypass is fine: we
  // only return rows for users that already pass the membership filter above).
  const service = pmServiceClient();
  if (service instanceof Response) return service;

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profileRows } = await service
    .from("user_profiles")
    .select("auth_user_id, display_name, email")
    .in("auth_user_id", userIds);

  const profiles = new Map<string, { display_name: string; email: string }>();
  (profileRows ?? []).forEach((p: { auth_user_id: string; display_name: string | null; email: string | null }) => {
    profiles.set(p.auth_user_id, {
      display_name: p.display_name ?? "",
      email: p.email ?? "",
    });
  });

  const members = rows.map((r) => {
    const p = profiles.get(r.user_id);
    return {
      workspace_id: r.workspace_id,
      user_id: r.user_id,
      role: r.role,
      invited_by: r.invited_by,
      created_at: r.created_at,
      display_name: p?.display_name ?? "",
      email: p?.email ?? "",
    };
  });

  return Response.json({ members });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId } = await params;

  const body = (await request.json().catch(() => null)) as
    | { email?: string; role?: string }
    | null;

  const email = body?.email?.trim().toLowerCase();
  const role = (body?.role ?? "member").trim();

  if (!email) {
    return Response.json({ error: "E-Mail ist erforderlich" }, { status: 400 });
  }
  if (!VALID_ROLES.has(role)) {
    return Response.json(
      { error: "Rolle muss admin, member oder guest sein" },
      { status: 400 },
    );
  }

  // Look up the auth user. user_profiles.email mirrors auth.users.email and
  // is RLS-readable via service-role; this avoids an admin.listUsers scan.
  const service = pmServiceClient();
  if (service instanceof Response) return service;

  const userLookup = await service
    .from("user_profiles")
    .select("auth_user_id")
    .eq("email", email)
    .maybeSingle();

  if (userLookup.error) {
    return Response.json({ error: userLookup.error.message }, { status: 500 });
  }
  if (!userLookup.data) {
    return Response.json(
      {
        error:
          "Kein Account mit dieser E-Mail. Der Empfänger muss sich zuerst bei Orange Octo registrieren.",
      },
      { status: 404 },
    );
  }

  const userId = userLookup.data.auth_user_id as string;

  // Insert via the *user* SSR client so the RLS policy
  // pm.is_workspace_admin() actually gates the action.
  const res = await session.sb
    .schema("pm")
    .from("workspace_members")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      role,
      invited_by: session.user.id,
    })
    .select("workspace_id, user_id, role, invited_by, created_at")
    .maybeSingle();

  if (res.error) {
    if (res.error.code === "23505") {
      return Response.json(
        { error: "Nutzer ist bereits Mitglied" },
        { status: 409 },
      );
    }
    if (res.error.code === "42501" || /row-level security/i.test(res.error.message)) {
      return Response.json(
        { error: "Keine Berechtigung — Admin-Rolle erforderlich" },
        { status: 403 },
      );
    }
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data) {
    return Response.json(
      { error: "Keine Berechtigung — Admin-Rolle erforderlich" },
      { status: 403 },
    );
  }
  return Response.json({ member: res.data }, { status: 201 });
}
