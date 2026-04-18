// SCH-483 — List the current user's chat conversations for the active company.

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  if (!companyId) return Response.json({ error: "companyId required" }, { status: 400 });

  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id, title, status, escalated_at, last_message_at, last_message_role, created_at")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ conversations: data ?? [] });
}
