import { requireCompanyAdmin } from "@/lib/company-admin";
import { createServiceClient } from "@/lib/operator";

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
// Rollback order on failure: if user_profile or company_members insert fails,
// we delete the freshly-created auth user so the admin can retry without
// email collisions piling up.
type RequestBody = {
  email?: string;
  password?: string;
  display_name?: string;
  role?: string;
  company_access?: string[];
};

export async function POST(request: Request) {
  const auth = await requireCompanyAdmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const email = body.email?.trim();
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

  const service = createServiceClient();

  // SCH-829: pre-flight orphan detection. If the email exists in auth.users
  // already, only allow the create flow to proceed if there is no associated
  // user_profile — otherwise the email is genuinely taken. If we detect an
  // orphan (auth row but no profile), surface a clearly-marked error so the
  // admin can resolve it via the User-Diagnose tool instead of seeing the raw
  // "already registered" message and getting stuck.
  const { data: existingProfile } = await service
    .from("user_profiles")
    .select("auth_user_id")
    .eq("email", email)
    .maybeSingle();

  const { data: createdUser, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    const msg = createErr.message || "";
    const looksLikeCollision = /already|registered|exists/i.test(msg);
    if (looksLikeCollision && !existingProfile) {
      return Response.json(
        {
          error: "orphan_detected",
          message:
            "Für diese E-Mail existiert bereits ein verwaister Auth-Eintrag ohne User-Profil. " +
            "Bitte über Admin → User-Diagnose aufräumen und erneut versuchen.",
          email,
        },
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
