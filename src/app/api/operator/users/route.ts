import { requireSuperadmin, createServiceClient, logOperatorAction } from "@/lib/operator";

export async function GET() {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const service = createServiceClient();

  // Get all user profiles
  const { data: profiles, error } = await service
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Get all company_members to show which companies each user belongs to
  const { data: members } = await service
    .from("company_members")
    .select("user_id, company_id, role, companies(name)");

  const memberMap = new Map<string, Array<{ company_id: string; company_name: string; role: string }>>();
  (members ?? []).forEach((m: Record<string, unknown>) => {
    const userId = m.user_id as string;
    const list = memberMap.get(userId) || [];
    list.push({
      company_id: m.company_id as string,
      company_name: (m.companies as Record<string, unknown>)?.name as string || m.company_id as string,
      role: m.role as string,
    });
    memberMap.set(userId, list);
  });

  // Get auth user metadata for ban/last_sign_in info
  const { data: { users: authUsers } } = await service.auth.admin.listUsers();
  const authMap = new Map<string, { banned: boolean; last_sign_in: string | null }>();
  (authUsers ?? []).forEach((u) => {
    authMap.set(u.id, {
      banned: u.banned_until ? new Date(u.banned_until) > new Date() : false,
      last_sign_in: u.last_sign_in_at || null,
    });
  });

  const enriched = (profiles ?? []).map((p: Record<string, unknown>) => ({
    id: p.id,
    auth_user_id: p.auth_user_id,
    display_name: p.display_name || "",
    email: p.email || "",
    role: p.role || "employee",
    is_superadmin: p.is_superadmin || false,
    created_at: p.created_at,
    companies: memberMap.get(p.auth_user_id as string) || [],
    banned: authMap.get(p.auth_user_id as string)?.banned || false,
    last_sign_in: authMap.get(p.auth_user_id as string)?.last_sign_in || null,
  }));

  return Response.json(enriched);
}

export async function PATCH(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { auth_user_id, action: userAction, plan } = await request.json();
  if (!auth_user_id || !userAction) {
    return Response.json({ error: "auth_user_id und action erforderlich" }, { status: 400 });
  }

  const service = createServiceClient();

  if (userAction === "suspend") {
    // Ban the user for 100 years (effectively permanent)
    const { error } = await service.auth.admin.updateUserById(auth_user_id, {
      ban_duration: "876000h",
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await logOperatorAction(auth.user!.id, "user.suspend", "user", auth_user_id);
    return Response.json({ success: true });
  }

  if (userAction === "unsuspend") {
    const { error } = await service.auth.admin.updateUserById(auth_user_id, {
      ban_duration: "none",
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await logOperatorAction(auth.user!.id, "user.unsuspend", "user", auth_user_id);
    return Response.json({ success: true });
  }

  if (userAction === "reset_password") {
    // Generate a password reset link (does not expose the password)
    const { data, error } = await service.auth.admin.generateLink({
      type: "recovery",
      email: plan, // repurpose the plan field for email
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await logOperatorAction(auth.user!.id, "user.password_reset", "user", auth_user_id);
    return Response.json({ recovery_link: data.properties?.action_link || "Link generiert" });
  }

  return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
