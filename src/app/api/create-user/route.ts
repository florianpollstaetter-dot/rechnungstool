import { requireCompanyAdmin } from "@/lib/company-admin";
import { createServiceClient } from "@/lib/operator";
import {
  DEFAULT_MEMBER_PERMISSIONS,
  FULL_MEMBER_PERMISSIONS,
  normalizeMemberPermissions,
  type MemberPermissions,
} from "@/lib/permissions";

// SCH-583 — admin-gated user creation + company binding.
// Previously this endpoint was unauthenticated: any caller could POST
// email/password and create a Supabase auth user. Now:
//
// 1. Require a logged-in tenant admin.
// 2. Validate that the requested `company_access` is a subset of the admin's
//    own company_members — no granting access to a tenant the admin isn't in.
// 3. Do the whole flow server-side (auth user + user_profile + company_members
//    inserts) so the client can't lie about company assignment.
//
// SCH-918 K2-γ — extends to capture:
//   * `permissions`: 9-key JSONB written into company_members.permissions for
//     each company in `company_access`. Owner/admin role gets FULL regardless;
//     `member` rows get exactly what the admin checked.
//   * `anchor_company_id`: the new MA's home company (G5). Must be one of the
//     companies the admin can grant access to.
//
// Rollback order on failure: if user_profile or company_members insert fails,
// we delete the freshly-created auth user so the admin can retry without
// email collisions piling up.
//
// SCH-934 — auto-cleanup of pre-existing orphan auth.users rows. Florian hit
// `orphan_detected` on a clean MA create because earlier failed signups left
// half-state rows in auth.users (no user_profile) that the SCH-829 hardening
// only flagged via an error message + manual User-Diagnose flow. We now treat
// a true orphan (auth.users row + no user_profile) as a recoverable state:
// drop the dangling auth row + any leftover memberships/role assignments,
// then continue with createUser. Email is normalised to lowercase to match
// Supabase's auth.users canonicalisation (same fix as register-company in
// SCH-928), so a mixed-case admin entry can't sneak past the pre-flight.
async function findOrphanAuthUserId(
  service: ReturnType<typeof createServiceClient>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < 1000) return null;
  }
  return null;
}

async function cleanupOrphanAuthUser(
  service: ReturnType<typeof createServiceClient>,
  authUserId: string,
) {
  // Same delete order as user-diagnose: downstream rows first so the auth
  // row remains as a marker if anything fails mid-flight.
  await service.from("user_role_assignments").delete().eq("user_id", authUserId);
  await service.from("company_members").delete().eq("user_id", authUserId);
  await service.from("user_profiles").delete().eq("auth_user_id", authUserId);
  await service.auth.admin.deleteUser(authUserId);
}

type RequestBody = {
  email?: string;
  password?: string;
  display_name?: string;
  role?: string;
  company_access?: string[];
  // SCH-918 K2-γ
  permissions?: Partial<MemberPermissions>;
  anchor_company_id?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireCompanyAdmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  // SCH-934 — lowercase to match auth.users canonicalisation. Without this a
  // mixed-case admin entry slips past the user_profiles pre-flight (text =,
  // case-sensitive) and trips createUser's lowercase-collision instead.
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const display_name = body.display_name?.trim() || email || "";
  const role = body.role || "employee";
  const requestedAccess = Array.isArray(body.company_access) ? body.company_access : [];

  if (!email || !password) {
    return Response.json({ error: "E-Mail und Passwort sind erforderlich" }, { status: 400 });
  }

  // Validate every requested company is one the admin is actually in.
  const invalidCompanies = requestedAccess.filter((id) => !auth.adminCompanyIds.includes(id));
  if (invalidCompanies.length > 0) {
    return Response.json(
      {
        error: `Kein Admin-Zugriff auf: ${invalidCompanies.join(", ")}`,
      },
      { status: 403 },
    );
  }
  // Fall back to the admin's current companies if the client sent an empty
  // list — creating a user that belongs to no tenant is never what we want.
  const companyIds = requestedAccess.length > 0 ? requestedAccess : auth.adminCompanyIds;
  if (companyIds.length === 0) {
    return Response.json(
      { error: "Admin ist in keiner Firma registriert — User-Anlage nicht möglich." },
      { status: 400 },
    );
  }

  // SCH-918 — anchor_company_id (G5). Allowed to be null on creation; if
  // provided it must be one of the granted companies AND in the admin's set.
  const anchorRaw = body.anchor_company_id;
  const anchorCompanyId =
    typeof anchorRaw === "string" && anchorRaw.trim() !== "" ? anchorRaw : null;
  if (anchorCompanyId && !companyIds.includes(anchorCompanyId)) {
    return Response.json(
      { error: `anchor_company_id ${anchorCompanyId} ist nicht in der Firmenliste.` },
      { status: 400 },
    );
  }
  if (anchorCompanyId && !auth.adminCompanyIds.includes(anchorCompanyId)) {
    return Response.json(
      { error: `Kein Admin-Zugriff auf Anker-Firma: ${anchorCompanyId}` },
      { status: 403 },
    );
  }

  // SCH-918 G2 — permissions JSONB. Owner/admin role gets FULL regardless of
  // what the client sent (matches DB backfill). For `manager`/`accountant`
  // legacy roles we also default to FULL because their static role table
  // already grants those sections; for `employee`/`member` we apply exactly
  // what the admin checked.
  const isPrivilegedRole = role === "admin" || role === "owner";
  const explicitPermissions = body.permissions
    ? normalizeMemberPermissions(body.permissions)
    : DEFAULT_MEMBER_PERMISSIONS;
  const permissionsToWrite: MemberPermissions = isPrivilegedRole
    ? FULL_MEMBER_PERMISSIONS
    : explicitPermissions;

  const service = createServiceClient();

  // SCH-829 / SCH-934: pre-flight collision + orphan detection. If
  // user_profiles already has the email it is a real collision — block.
  // If only auth.users has the email (no user_profile), it's a leftover
  // half-state from a previously aborted signup; SCH-934 recovers it
  // automatically by hard-deleting the dangling auth row + any stray
  // memberships/role assignments before re-running createUser. The admin
  // gate already authorises this destructive recovery — the orphan has no
  // login-capable profile so nothing of value is lost.
  const { data: existingProfile } = await service
    .from("user_profiles")
    .select("auth_user_id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    return Response.json(
      { error: "email_exists", message: "Diese Email-Adresse ist bereits vergeben." },
      { status: 409 },
    );
  }

  try {
    const orphanAuthId = await findOrphanAuthUserId(service, email);
    if (orphanAuthId) {
      await cleanupOrphanAuthUser(service, orphanAuthId);
    }
  } catch (err) {
    console.error("create-user: orphan pre-cleanup failed", err);
    // Fall through to createUser; if a true collision remains the
    // structured error path below will surface it.
  }

  const { data: createdUser, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    const msg = createErr.message || "";
    const code = (createErr as { code?: string }).code;
    const looksLikeCollision =
      code === "email_exists" ||
      code === "user_already_exists" ||
      /already|registered|exists/i.test(msg);
    if (looksLikeCollision) {
      // After auto-cleanup this should mean a real collision arrived
      // between the cleanup and createUser (extremely unlikely outside a
      // races with a concurrent signup). Treat it as a genuine duplicate.
      return Response.json(
        { error: "email_exists", message: "Diese Email-Adresse ist bereits vergeben." },
        { status: 409 },
      );
    }
    return Response.json({ error: msg }, { status: 400 });
  }
  const authUserId = createdUser?.user?.id;
  if (!authUserId) {
    return Response.json(
      { error: "Benutzer wurde erstellt, aber keine ID zurückgegeben." },
      { status: 500 },
    );
  }

  async function rollbackAuth() {
    await service.auth.admin.deleteUser(authUserId!).catch(() => undefined);
  }

  // SCH-829: wrap the post-createUser flow in a unified try/catch. The previous
  // version only rolled back on the specific PostgREST error paths it knew
  // about; an unexpected throw (network blip, JSON parse, deploy mid-request)
  // would leave the freshly-created auth.users row orphaned. This catch is the
  // safety net that triggered the h.weiss@lolaxmedia.com incident.
  try {
    const { error: profileErr } = await service.from("user_profiles").insert({
      auth_user_id: authUserId,
      display_name,
      email,
      role,
      company_access: JSON.stringify(companyIds),
      // SCH-918 G5
      anchor_company_id: anchorCompanyId,
    });
    if (profileErr) {
      await rollbackAuth();
      return Response.json(
        { error: `Profil konnte nicht angelegt werden: ${profileErr.message}` },
        { status: 500 },
      );
    }

    const memberRows = companyIds.map((companyId) => ({
      user_id: authUserId,
      company_id: companyId,
      role: role === "admin" ? "admin" : "member",
      // SCH-918 G2 — same permissions JSONB across every company the admin
      // grants in this single create. Per-company overrides happen later via
      // the user-edit UI (separate ticket).
      permissions: permissionsToWrite,
    }));
    const { error: membersErr } = await service.from("company_members").insert(memberRows);
    if (membersErr) {
      await service.from("user_profiles").delete().eq("auth_user_id", authUserId);
      await rollbackAuth();
      return Response.json(
        { error: `Firmen-Zuordnung fehlgeschlagen: ${membersErr.message}` },
        { status: 500 },
      );
    }

    return Response.json({
      userId: authUserId,
      companyIds,
    });
  } catch (err) {
    // Unknown failure after auth.users was created — best-effort cleanup of
    // both downstream rows and the auth row, in that order.
    await service
      .from("user_profiles")
      .delete()
      .eq("auth_user_id", authUserId)
      .then(() => undefined, () => undefined);
    await rollbackAuth();
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("create-user: unexpected failure after auth.users insert", err);
    return Response.json(
      { error: `Anlage abgebrochen, Auth-Eintrag wurde zurückgerollt: ${message}` },
      { status: 500 },
    );
  }
}
