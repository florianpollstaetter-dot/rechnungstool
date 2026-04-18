// SCH-483 — Superadmin posts a reply into a chatbot conversation.
// Stored as role="superadmin"; bumps conversation pointer.

import { requireSuperadmin, createServiceClient, logOperatorAction } from "@/lib/operator";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadmin();
  if (auth.error || !auth.user) return Response.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;

  const body = await request.json().catch(() => null) as { content?: string } | null;
  const content = body?.content?.trim();
  if (!content) return Response.json({ error: "content required" }, { status: 400 });

  const service = createServiceClient();

  const { data: conv, error: convErr } = await service
    .from("chat_conversations")
    .select("id, status")
    .eq("id", id)
    .single();
  if (convErr || !conv) return Response.json({ error: "not found" }, { status: 404 });

  const now = new Date().toISOString();

  const { data: message, error: msgErr } = await service
    .from("chat_messages")
    .insert({
      conversation_id: id,
      role: "superadmin",
      content,
      author_user_id: auth.user.id,
    })
    .select("id, role, content, created_at, author_user_id")
    .single();
  if (msgErr) return Response.json({ error: msgErr.message }, { status: 500 });

  await service
    .from("chat_conversations")
    .update({
      last_message_at: now,
      last_message_role: "superadmin",
      updated_at: now,
      status: conv.status === "resolved" ? "escalated" : conv.status,
    })
    .eq("id", id);

  await logOperatorAction(auth.user.id, "chat.reply", "chat_conversation", id, {
    content_length: content.length,
  });

  return Response.json({ message });
}
