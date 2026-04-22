// SCH-483 — User escalates a chat conversation to superadmin.
// Posts a system marker message and flips status to "escalated".

import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date().toISOString();

  const { data: conv, error: updErr } = await supabase
    .from("chat_conversations")
    .update({
      status: "escalated",
      escalated_at: now,
      last_message_at: now,
      last_message_role: "system",
      updated_at: now,
    })
    .eq("id", id)
    .select("id, status, escalated_at")
    .single();

  if (updErr || !conv) return Response.json({ error: updErr?.message || "not found" }, { status: 404 });

  // Best-effort system notice. The conversation is already marked escalated,
  // so log but don't fail the response if the notice row can't be inserted.
  const { error: noticeErr } = await supabase.from("chat_messages").insert({
    conversation_id: id,
    role: "system",
    content: "Gespräch wurde an den Superadmin weitergeleitet. Du bekommst eine Antwort, sobald jemand verfügbar ist.",
    author_user_id: user.id,
  });
  if (noticeErr) {
    console.error("chat/escalate: could not insert system notice:", noticeErr.message);
  }

  return Response.json({ conversation: conv });
}
