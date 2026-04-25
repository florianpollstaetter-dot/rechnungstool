import { requireCompanyAdmin, logCompanyAuditAction } from "@/lib/company-admin";
import { createServiceClient } from "@/lib/operator";

// SCH-829 — Admin User-Diagnose tool.
//
// Why this exists: a tenant-admin (Florian) needs self-serve recovery for the
// orphan-state class of bugs where auth.users has a row but user_profiles /
// company_members is missing or partial. Without this, the only fix path is
// "ping an engineer to run SQL against the prod DB". This route gives admins
// a read-then-hard-delete loop, gated by:
//
//   1. requireCompanyAdmin — must be a tenant admin (user_profiles.role='admin')
//   2. for delete: target email must either be unattached to any company (true
//      orphan) or belong to a company the caller administrates. Cross-tenant
//      hard-delete is forbidden.
//   3. for delete: caller must echo the target email back as `confirm_email`.
//
// Result rows are returned verbatim (no auth secrets — passwords are hashed
// in auth.users and we explicitly omit them from the response shape).

type DiagnoseBody = { email?: string };
type DeleteBody = DiagnoseBody & { confirm_email?: string };

type AuthUserSlim = {
  id: string;
  email: string | undefined;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
};

async function findAuthUserByEmail(
  service: ReturnType<typeof createServiceClient>,
  email: string,
): Promise<AuthUserSlim | null> {
  // listUsers is paginated; for our user base (~hundreds) page through until
  // we find the match. We bail at 50 pages to avoid unbounded scans if the
  // SDK ever changes default pageSize.
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === target);
    if (hit) {
      return {
        id: hit.id,
        email: hit.email,
        created_at: hit.created_at,
        email_confirmed_at: hit.email_confirmed_at ?? null,
        last_sign_in_at: hit.last_sign_in_at ?? null,
        raw_app_meta_data: (hit.app_metadata as Record<string, unknown>) ?? null,
        raw_user_meta_data: (hit.user_metadata as Record<string, unknown>) ?? null,
      };
    }
    if (users.length < 1000) return null;
  }
  return null;
}

async function gatherDiagnostics(
  service: ReturnType<typeof createServiceClient>,
  email: string,
) {
  const authUser = await findAuthUserByEmail(service, email);

  const profileQuery = service
    .from("user_profiles")
    .select("id, auth_user_id, display_name, email, role, company_access, created_at, is_superadmin")
    .eq("email", email);
  const { data: profilesByEmail } = await profileQuery;

  const knownAuthIds = new Set<string>();
  if (authUser) knownAuthIds.add(authUser.id);
  for (const p of profilesByEmail ?? []) {
    if (p.auth_user_id) knownAuthIds.add(p.auth_user_id as string);
  }

  let memberships: Array<{
    company_id: string;
    user_id: string;
    role: string;
    created_at: string;
  }> = [];
  let roleAssignments: Array<{
    id: string;
    company_id: string;
    user_id: string;
    role_id: string;
    created_at: string;
  }> = [];

  if (knownAuthIds.size > 0) {
    const ids = Array.from(knownAuthIds);
    const { data: membersData } = await service
      .from("company_members")
      .select("company_id, user_id, role, created_at")
      .in("user_id", ids);
    memberships = (membersData ?? []) as typeof memberships;

    const { data: roleData } = await service
      .from("user_role_assignments")
      .select("id, company_id, user_id, role_id, created_at")
      .in("user_id", ids);
    roleAssignments = (roleData ?? []) as typeof roleAssignments;
  }

  const orphanReasons: string[] = [];
  if (authUser && (profilesByEmail ?? []).length === 0) {
    orphanReasons.push("auth.users existiert, aber kein user_profiles-Eintrag");
  }
  if (authUser && memberships.length === 0) {
    orphanReasons.push("auth.users existiert, aber keine company_members-Zuordnung");
  }
  if (!authUser && (profilesByEmail ?? []).length > 0) {
    orphanReasons.push(
      "user_profiles existiert ohne passenden auth.users-Eintrag (Profil-Geist)",
    );
  }

  return {
    email,
    authUser,
    profiles: profilesByEmail ?? [],
    memberships,
    roleAssignments,
    isOrphan: orphanReasons.length > 0,
    orphanReasons,
  };
}

export async function POST(request: Request) {
  const auth = await requireCompanyAdmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as DiagnoseBody;
  const email = body.email?.trim();
  if (!email) {
    return Response.json({ error: "E-Mail erforderlich" }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const diag = await gatherDiagnostics(service, email);
    return Response.json(diag);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("user-diagnose: lookup failed", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireCompanyAdmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as DeleteBody;
  const email = body.email?.trim();
  const confirmEmail = body.confirm_email?.trim();
  if (!email || !confirmEmail) {
    return Response.json({ error: "email und confirm_email sind erforderlich" }, { status: 400 });
  }
  if (email.toLowerCase() !== confirmEmail.toLowerCase()) {
    return Response.json(
      { error: "Bestätigungs-E-Mail stimmt nicht mit der Ziel-E-Mail überein" },
      { status: 400 },
    );
  }

  const service = createServiceClient();
  let diag;
  try {
    diag = await gatherDiagnostics(service, email);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("user-diagnose: pre-delete lookup failed", err);
    return Response.json({ error: message }, { status: 500 });
  }

  if (!diag.authUser && diag.profiles.length === 0) {
    return Response.json(
      { error: "Kein User mit dieser E-Mail gefunden — nichts zu löschen." },
      { status: 404 },
    );
  }

  // Self-protection: caller may not delete themselves through this tool.
  if (diag.authUser?.id === auth.user!.id) {
    return Response.json(
      { error: "Eigenes Konto kann nicht über User-Diagnose gelöscht werden." },
      { status: 400 },
    );
  }

  // Refuse to hard-delete a superadmin via this tool.
  if (diag.profiles.some((p) => p.is_superadmin)) {
    return Response.json(
      { error: "Superadmin kann nicht über User-Diagnose gelöscht werden." },
      { status: 403 },
    );
  }

  // Cross-tenant guardrail: if the target has any membership, at least one of
  // those companies must be in the caller's adminCompanyIds. True orphans
  // (no membership rows) are always deletable by any tenant admin — that's
  // the whole point of the tool.
  if (diag.memberships.length > 0) {
    const targetCompanyIds = diag.memberships.map((m) => m.company_id);
    const overlap = targetCompanyIds.some((id) => auth.adminCompanyIds.includes(id));
    if (!overlap) {
      return Response.json(
        { error: "Kein Admin-Zugriff auf die Firma(n) dieses Users." },
        { status: 403 },
      );
    }
  }

  // Delete order: downstream rows first, auth.users last so re-runs can
  // recover from a mid-flight failure (auth.admin.deleteUser is idempotent).
  const targetIds = Array.from(
    new Set([
      ...(diag.authUser ? [diag.authUser.id] : []),
      ...diag.profiles.map((p) => p.auth_user_id as string).filter(Boolean),
    ]),
  );

  const deletionLog: string[] = [];
  for (const id of targetIds) {
    const { error: roleErr } = await service
      .from("user_role_assignments")
      .delete()
      .eq("user_id", id);
    if (roleErr) deletionLog.push(`user_role_assignments(${id}): ${roleErr.message}`);

    const { error: memberErr } = await service.from("company_members").delete().eq("user_id", id);
    if (memberErr) deletionLog.push(`company_members(${id}): ${memberErr.message}`);

    const { error: profileErr } = await service
      .from("user_profiles")
      .delete()
      .eq("auth_user_id", id);
    if (profileErr) deletionLog.push(`user_profiles(${id}): ${profileErr.message}`);

    const { error: authErr } = await service.auth.admin.deleteUser(id);
    if (authErr) deletionLog.push(`auth.users(${id}): ${authErr.message}`);
  }

  // Profile-only ghosts (no auth row): clean by email.
  if (!diag.authUser && diag.profiles.length > 0) {
    const { error: ghostErr } = await service.from("user_profiles").delete().eq("email", email);
    if (ghostErr) deletionLog.push(`user_profiles(by-email): ${ghostErr.message}`);
  }

  // Audit log — best-effort; we still return success even if the audit insert
  // fails, because the destructive operation itself succeeded.
  for (const companyId of auth.adminCompanyIds) {
    await logCompanyAuditAction(
      auth.user!.id,
      companyId,
      "user.diagnose_hard_delete",
      "user",
      email,
      {
        target_auth_ids: targetIds,
        before: diag,
        deletion_log: deletionLog,
      },
    );
  }

  return Response.json({
    success: true,
    deleted_auth_user_ids: targetIds,
    deletion_warnings: deletionLog,
    before: diag,
  });
}
