// SCH-483 — Load a single conversation + its messages (owner-only via RLS).

import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: conv, error: convErr } = await supabase
    .from("chat_conversations")
    .select("id, company_id, title, status, escalated_at, resolved_at, last_message_at, created_at")
    .eq("id", id)
    .single();
  if (convErr || !conv) return Response.json({ error: "not found" }, { status: 404 });

  const { data: messages, error: msgErr } = await supabase
    .from("chat_messages")
    .select("id, role, content, metadata, created_at, author_user_id")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (msgErr) return Response.json({ error: msgErr.message }, { status: 500 });

  return Response.json({ conversation: conv, messages: messages ?? [] });
}
