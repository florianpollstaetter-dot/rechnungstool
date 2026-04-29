import { requireCompanyAdmin, logCompanyAuditAction, generateTempPassword } from "@/lib/company-admin";
import { createServiceClient } from "@/lib/operator";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { buildTempPasswordEmail } from "@/lib/emails/temp-password";

export async function PATCH(request: Request) {
  const auth = await requireCompanyAdmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { auth_user_id: targetAuthUserId, action: userAction } = await request.json();
  if (!targetAuthUserId || !userAction) {
    return Response.json({ error: "auth_user_id und action erforderlich" }, { status: 400 });
  }

  if (targetAuthUserId === auth.user!.id) {
    return Response.json(
      { error: "Eigenes Passwort bitte unter Profil → Passwort ändern zurücksetzen." },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  // Target must share at least one company with the caller.
  const { data: targetMemberships } = await service
    .from("company_members")
    .select("company_id, companies(name)")
    .eq("user_id", targetAuthUserId);

  const sharedMembership = (targetMemberships ?? []).find((m) =>
    auth.adminCompanyIds.includes(m.company_id as string),
  );
  if (!sharedMembership) {
    return Response.json(
      { error: "Kein Zugriff auf diese:n Mitarbeiter:in (andere Firma)." },
      { status: 403 },
    );
  }
  const companyId = sharedMembership.company_id as string;
  const rawCompany = sharedMembership.companies as
    | { name?: string }
    | { name?: string }[]
    | null
    | undefined;
  const companyRecord = Array.isArray(rawCompany) ? rawCompany[0] : rawCompany;
  const companyName = companyRecord?.name || "Orange Octo";

  if (
    userAction !== "set_temp_password" &&
    userAction !== "send_temp_password_email" &&
    userAction !== "update_user"
  ) {
    return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
  }

  // SCH-918 K3-V3 — Admin-Edit-Always: change email + profile fields on
  // a target user from the same company. Email change is mirrored to
  // auth.users so the user can keep logging in with the new address.
  if (userAction === "update_user") {
    const body = (await request
      .clone()
      .json()
      .catch(() => null)) as
      | {
          email?: unknown;
          display_name?: unknown;
        }
      | null;
    const newEmail =
      typeof body?.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
    const newDisplayName =
      typeof body?.display_name === "string" && body.display_name.trim()
        ? body.display_name.trim()
        : null;

    if (!newEmail && !newDisplayName) {
      return Response.json(
        { error: "Mindestens email oder display_name muss gesetzt sein" },
        { status: 400 },
      );
    }
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return Response.json(
        { error: "Ungültiges E-Mail-Format" },
        { status: 400 },
      );
    }

    // 1) Update Supabase Auth email FIRST. If this fails (e.g. duplicate),
    //    bail out before touching the profile so the two stay consistent.
    if (newEmail) {
      const { error: authErr } = await service.auth.admin.updateUserById(targetAuthUserId, {
        email: newEmail,
        email_confirm: true,
      });
      if (authErr) {
        const status = /already|exists|registered/i.test(authErr.message ?? "") ? 409 : 500;
        return Response.json({ error: authErr.message }, { status });
      }
    }

    // 2) Mirror onto user_profiles.
    const profileUpdate: Record<string, unknown> = {};
    if (newEmail) profileUpdate.email = newEmail;
    if (newDisplayName) profileUpdate.display_name = newDisplayName;
    const { error: profErr } = await service
      .from("user_profiles")
      .update(profileUpdate)
      .eq("auth_user_id", targetAuthUserId);
    if (profErr) {
      return Response.json({ error: profErr.message }, { status: 500 });
    }

    await logCompanyAuditAction(
      auth.user!.id,
      companyId,
      "user.update_profile",
      "user",
      targetAuthUserId,
    );

    return Response.json({
      updated: true,
      email_changed: !!newEmail,
      display_name_changed: !!newDisplayName,
    });
  }

  const tempPassword = generateTempPassword();

  const { error: updateError } = await service.auth.admin.updateUserById(targetAuthUserId, {
    password: tempPassword,
  });
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  const { error: profileError } = await service
    .from("user_profiles")
    .update({ must_change_password: true })
    .eq("auth_user_id", targetAuthUserId);
  if (profileError) return Response.json({ error: profileError.message }, { status: 500 });

  await logCompanyAuditAction(
    auth.user!.id,
    companyId,
    "user.set_temp_password",
    "user",
    targetAuthUserId,
  );

  if (userAction === "set_temp_password") {
    return Response.json({ temp_password: tempPassword });
  }

  // send_temp_password_email
  const { data: profile } = await service
    .from("user_profiles")
    .select("email, display_name")
    .eq("auth_user_id", targetAuthUserId)
    .maybeSingle();

  const recipientEmail = (profile?.email as string) || "";
  const displayName = (profile?.display_name as string) || recipientEmail;

  if (!isEmailConfigured()) {
    return Response.json({ sent: false, reason: "not_configured", temp_password: tempPassword });
  }
  if (!recipientEmail) {
    return Response.json({
      sent: false,
      reason: "error",
      message: "E-Mail-Adresse fehlt",
      temp_password: tempPassword,
    });
  }

  const origin =
    request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://orange-octo.com";
  const loginUrl = `${origin}/login`;
  const payload = buildTempPasswordEmail({
    to: recipientEmail,
    displayName,
    tempPassword,
    companyName,
    loginUrl,
  });

  const result = await sendEmail(payload);
  if (result.sent) {
    await logCompanyAuditAction(
      auth.user!.id,
      companyId,
      "user.send_temp_password_email",
      "user",
      targetAuthUserId,
    );
    return Response.json({ sent: true, email: recipientEmail });
  }

  return Response.json({
    sent: false,
    reason: result.reason,
    message: result.reason === "error" ? result.message : undefined,
    temp_password: tempPassword,
  });
}

// SCH-567: Delete a user from the caller's companies.
// Removes memberships first, then if the target has no remaining memberships,
// purges the profile and the auth identity so the email can be reused and
// the user can no longer log in. auth.users is deleted LAST so a failure
// there leaves us re-runnable (profile already gone, but auth.admin.deleteUser
// is idempotent on 404).
export async function DELETE(request: Request) {
  const auth = await requireCompanyAdmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { auth_user_id: targetAuthUserId } = await request.json();
  if (!targetAuthUserId) {
    return Response.json({ error: "auth_user_id erforderlich" }, { status: 400 });
  }

  if (targetAuthUserId === auth.user!.id) {
    return Response.json({ error: "Eigenes Konto kann nicht gelöscht werden." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: targetMemberships } = await service
    .from("company_members")
    .select("company_id")
    .eq("user_id", targetAuthUserId);

  const targetCompanyIds = (targetMemberships ?? []).map((m) => m.company_id as string);
  const sharedCompanyIds = targetCompanyIds.filter((id) => auth.adminCompanyIds.includes(id));

  if (sharedCompanyIds.length === 0) {
    return Response.json(
      { error: "Kein Zugriff auf diese:n Mitarbeiter:in (andere Firma)." },
      { status: 403 },
    );
  }

  const { data: targetProfile } = await service
    .from("user_profiles")
    .select("id, is_superadmin")
    .eq("auth_user_id", targetAuthUserId)
    .maybeSingle();

  if (targetProfile?.is_superadmin) {
    return Response.json(
      { error: "Superadmin kann nicht über das Admin-Panel gelöscht werden." },
      { status: 403 },
    );
  }

  const { error: memberDeleteError } = await service
    .from("company_members")
    .delete()
    .eq("user_id", targetAuthUserId)
    .in("company_id", sharedCompanyIds);
  if (memberDeleteError) {
    return Response.json({ error: memberDeleteError.message }, { status: 500 });
  }

  const remainingCompanyIds = targetCompanyIds.filter((id) => !sharedCompanyIds.includes(id));
  const fullyPurged = remainingCompanyIds.length === 0;

  if (fullyPurged) {
    // user_role_assignments / user_work_schedules / user_dashboard_layouts
    // cascade off user_profiles.id. Cleaning the profile frees those rows
    // before we drop the auth identity.
    const { error: profileDeleteError } = await service
      .from("user_profiles")
      .delete()
      .eq("auth_user_id", targetAuthUserId);
    if (profileDeleteError) {
      return Response.json({ error: profileDeleteError.message }, { status: 500 });
    }

    const { error: authDeleteError } = await service.auth.admin.deleteUser(targetAuthUserId);
    if (authDeleteError) {
      return Response.json({ error: authDeleteError.message }, { status: 500 });
    }
  }

  for (const companyId of sharedCompanyIds) {
    await logCompanyAuditAction(
      auth.user!.id,
      companyId,
      fullyPurged ? "user.delete" : "user.remove_from_company",
      "user",
      targetAuthUserId,
    );
  }

  return Response.json({ success: true, fullyPurged });
}
