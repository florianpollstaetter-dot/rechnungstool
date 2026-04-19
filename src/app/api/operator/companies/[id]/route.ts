import { requireSuperadmin, createServiceClient } from "@/lib/operator";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const service = createServiceClient();

  const { data: company, error } = await service
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !company) {
    return Response.json({ error: error?.message || "Unternehmen nicht gefunden" }, { status: 404 });
  }

  const [{ count: receiptCount }, { count: invoiceCount }, { data: members }] = await Promise.all([
    service.from("receipts").select("id", { count: "exact", head: true }).eq("company_id", id),
    service.from("invoices").select("id", { count: "exact", head: true }).eq("company_id", id),
    service
      .from("company_members")
      .select("user_id, role, created_at")
      .eq("company_id", id),
  ]);

  const memberUserIds = (members ?? []).map((m: { user_id: string }) => m.user_id);

  const profiles: Record<string, Record<string, unknown>> = {};
  if (memberUserIds.length > 0) {
    const { data: profileRows } = await service
      .from("user_profiles")
      .select("*")
      .in("auth_user_id", memberUserIds);
    (profileRows ?? []).forEach((p: Record<string, unknown>) => {
      profiles[p.auth_user_id as string] = p;
    });
  }

  const { data: { users: authUsers } } = await service.auth.admin.listUsers();
  const authMap = new Map<string, { banned: boolean; last_sign_in: string | null; email: string }>();
  (authUsers ?? []).forEach((u) => {
    authMap.set(u.id, {
      banned: u.banned_until ? new Date(u.banned_until) > new Date() : false,
      last_sign_in: u.last_sign_in_at || null,
      email: u.email || "",
    });
  });

  const users = (members ?? []).map((m: { user_id: string; role: string; created_at: string }) => {
    const profile = profiles[m.user_id] || {};
    const authInfo = authMap.get(m.user_id);
    return {
      auth_user_id: m.user_id,
      member_role: m.role,
      member_since: m.created_at,
      display_name: (profile.display_name as string) || "",
      email: (profile.email as string) || authInfo?.email || "",
      role: (profile.role as string) || "employee",
      is_superadmin: (profile.is_superadmin as boolean) || false,
      banned: authInfo?.banned || false,
      last_sign_in: authInfo?.last_sign_in || null,
    };
  });

  return Response.json({
    ...company,
    receipt_count: receiptCount ?? 0,
    invoice_count: invoiceCount ?? 0,
    user_count: users.length,
    users,
  });
}
