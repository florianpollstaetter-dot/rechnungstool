// SCH-483 — Superadmin marks a chat conversation as resolved.

import { requireSuperadmin, createServiceClient, logOperatorAction } from "@/lib/operator";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadmin();
  if (auth.error || !auth.user) return Response.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;

  const service = createServiceClient();
  const now = new Date().toISOString();

  const { data: conv, error } = await service
    .from("chat_conversations")
    .update({
      status: "resolved",
      resolved_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select("id, status, resolved_at")
    .single();

  if (error || !conv) return Response.json({ error: error?.message || "not found" }, { status: 404 });

  await logOperatorAction(auth.user.id, "chat.resolve", "chat_conversation", id);
  return Response.json({ conversation: conv });
}
