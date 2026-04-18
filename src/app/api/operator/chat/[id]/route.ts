// SCH-483 — Superadmin fetches a single chatbot conversation + messages
// (any company). Uses service_role to bypass RLS.

import { requireSuperadmin, createServiceClient } from "@/lib/operator";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;

  const service = createServiceClient();

  const { data: conv, error: convErr } = await service
    .from("chat_conversations")
    .select("id, company_id, user_id, title, status, escalated_at, resolved_at, last_message_at, created_at")
    .eq("id", id)
    .single();
  if (convErr || !conv) return Response.json({ error: "not found" }, { status: 404 });

  const [messagesRes, companyRes, profileRes] = await Promise.all([
    service
      .from("chat_messages")
      .select("id, role, content, metadata, created_at, author_user_id")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
    service.from("companies").select("id, name").eq("id", conv.company_id).single(),
    service
      .from("user_profiles")
      .select("auth_user_id, display_name, email")
      .eq("auth_user_id", conv.user_id)
      .single(),
  ]);

  return Response.json({
    conversation: {
      ...conv,
      company_name: companyRes.data?.name || conv.company_id,
      user_label:
        profileRes.data?.display_name || profileRes.data?.email || "—",
    },
    messages: messagesRes.data ?? [],
  });
}
