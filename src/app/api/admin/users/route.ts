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

  if (userAction !== "set_temp_password" && userAction !== "send_temp_password_email") {
    return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
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
