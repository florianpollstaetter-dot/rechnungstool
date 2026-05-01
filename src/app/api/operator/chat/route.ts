// SCH-483 — Superadmin inbox listing for chatbot conversations across all
// companies. Bypasses RLS via service_role.

import { requireSuperadmin, createServiceClient } from "@/lib/operator";

export async function GET(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status"); // "escalated" | "active" | "resolved" | "bugs" | null (all)

  const service = createServiceClient();
  let query = service
    .from("chat_conversations")
    .select("id, company_id, user_id, title, status, is_bug_report, escalated_at, resolved_at, last_message_at, last_message_role, created_at")
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (statusFilter === "bugs") {
    query = query.eq("is_bug_report", true);
  } else if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: conversations, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Hydrate with company names + user emails for display.
  const companyIds = Array.from(new Set((conversations ?? []).map((c) => c.company_id)));
  const userIds = Array.from(new Set((conversations ?? []).map((c) => c.user_id)));

  const [companiesRes, profilesRes] = await Promise.all([
    companyIds.length
      ? service.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length
      ? service.from("user_profiles").select("auth_user_id, display_name, email").in("auth_user_id", userIds)
      : Promise.resolve({ data: [] as { auth_user_id: string; display_name: string | null; email: string | null }[] }),
  ]);

  const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.id, c.name]));
  const profileMap = new Map(
    (profilesRes.data ?? []).map((p) => [p.auth_user_id, p.display_name || p.email || "—"]),
  );

  const hydrated = (conversations ?? []).map((c) => ({
    ...c,
    company_name: companyMap.get(c.company_id) || c.company_id,
    user_label: profileMap.get(c.user_id) || "—",
  }));

  return Response.json({ conversations: hydrated });
}
