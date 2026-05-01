// SCH-483 — Send a chat message. Creates a conversation on first send,
// stores the user message, calls Claude for the assistant reply, stores it,
// and returns both messages + the conversation id.

import { createClient } from "@/lib/supabase/server";
import { callClaudeChat, calculateCostEUR } from "@/lib/ai-client";
import { buildChatSystemPrompt, type AppLocale } from "@/lib/chat-prompt";
import { logAndSanitize } from "@/lib/api-errors";

const SUPPORTED_LOCALES = new Set<AppLocale>(["de", "en", "fr", "es", "it", "tr", "pl", "ar"]);

const MAX_HISTORY = 30;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    conversationId?: string;
    companyId?: string;
    content?: string;
    language?: string;
  } | null;

  const content = body?.content?.trim();
  const companyId = body?.companyId?.trim();
  const requestedLang = (body?.language || "de") as AppLocale;
  const language: AppLocale = SUPPORTED_LOCALES.has(requestedLang) ? requestedLang : "de";
  if (!content) return Response.json({ error: "content required" }, { status: 400 });
  if (!companyId) return Response.json({ error: "companyId required" }, { status: 400 });

  // Get or create conversation. SCH-961: when client sends a stale
  // conversationId (company switched, conversation archived, RLS mismatch),
  // soft-fallback to a fresh conversation instead of returning 404.
  let conversationId = body?.conversationId;
  let conversationRecovered = false;
  if (conversationId) {
    const { data: conv } = await supabase
      .from("chat_conversations")
      .select("id, status")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) {
      conversationRecovered = true;
      conversationId = undefined;
    }
  }
  if (!conversationId) {
    const title = content.slice(0, 60);
    const { data: conv, error } = await supabase
      .from("chat_conversations")
      .insert({ company_id: companyId, user_id: user.id, title })
      .select("id")
      .single();
    if (error || !conv) {
      return Response.json({ error: error?.message || "failed to create conversation" }, { status: 500 });
    }
    conversationId = conv.id;
    if (conversationRecovered) {
      console.log("chat.conversation_recovered", { user_id: user.id, company_id: companyId });
    }
  }

  // Store user message
  const { error: userMsgErr } = await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content,
    author_user_id: user.id,
  });
  if (userMsgErr) {
    return Response.json({ error: userMsgErr.message }, { status: 500 });
  }

  // Load recent history for context (ordered oldest → newest)
  const { data: history } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);

  const ordered = (history || []).slice().reverse();

  // Map roles: "superadmin" messages surface to the LLM as assistant replies.
  // "system" rows are skipped (we always pass CHAT_SYSTEM_PROMPT explicitly).
  const llmMessages = ordered
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: String(m.content),
    }));

  let assistantText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const result = await callClaudeChat(llmMessages, buildChatSystemPrompt(language), 1024);
    assistantText = result.text.trim();
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (err) {
    const safeMessage = logAndSanitize("chat/messages", err, "nicht erreichbar");
    assistantText = `⚠️ Der Assistent ist derzeit nicht erreichbar (${safeMessage}). Wenn das anhält, klick bitte auf „Bug melden" – wir kümmern uns drum.`;
  }

  const costEUR = calculateCostEUR(inputTokens, outputTokens);

  // Store assistant message
  const { data: assistantMsg, error: asstErr } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: assistantText,
      metadata: { input_tokens: inputTokens, output_tokens: outputTokens, cost_eur: costEUR },
    })
    .select("id, role, content, created_at")
    .single();

  if (asstErr) {
    return Response.json({ error: asstErr.message }, { status: 500 });
  }

  // Update conversation pointer — best-effort, log but don't fail the response
  // since the assistant message was already stored successfully.
  const { error: pointerErr } = await supabase
    .from("chat_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_role: "assistant",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
  if (pointerErr) {
    console.error("chat/messages: could not update conversation pointer:", pointerErr.message);
  }

  return Response.json({
    conversationId,
    assistantMessage: assistantMsg,
  });
}
