// ORA-2282 — Treasury Skill chat endpoint.
//
// Wires the `treasury` Anthropic skill to an authenticated, RLS-scoped
// Supabase session. The route:
//
//   1. Authenticates the user via SSR cookies and resolves the active
//      `company_id`.
//   2. Hard-gates on `company_subscriptions.has_treasury` (defense-in-depth
//      behind the middleware that already 404s the path).
//   3. Calls Claude on AWS Bedrock (`eu-central-1`) with the tool catalogue
//      built from `src/lib/treasury/skill-tools.ts`. The system prompt and
//      the trailing tool definition carry `cache_control: ephemeral` so the
//      prompt cache reuses the static prefix across follow-ups.
//   4. Runs a bounded tool-loop: while the assistant replies with
//      `stop_reason === "tool_use"`, we execute each requested tool through
//      `runTreasuryTool` (which validates input + handles errors) and feed
//      the results back as a `user` message with `tool_result` blocks.
//   5. Returns the final assistant text + a normalized tool-trace so the UI
//      can render which tools were called.
//
// EU-only data plane: this route refuses to run without AWS Bedrock
// credentials. No fallback to direct Anthropic-US.
// No funds custody: every mutation goes through a `propose_*` tool that
// inserts a draft. This route never sends EBICS payloads.

import { NextResponse } from "next/server";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";
import {
  buildAnthropicToolDefinitions,
  runTreasuryTool,
  type SkillContext,
} from "@/lib/treasury/skill-tools";
import { BEDROCK_MODEL } from "@/lib/ai-model";

export const runtime = "nodejs";

const SYSTEM_PROMPT_DE = `Du bist der Treasury-Skill der Orange-Octo-Anwendung. Du beantwortest Fragen zu Cash-Position, Forecast, Bank-Konten, EBICS, Payments, SEPA, Sanctions, Hedging und Konzern-Konsolidierung.

Regeln:
- Jede Antwort mit Zahlen/Daten MUSS auf einem Tool-Call basieren — niemals raten.
- Zitiere die IDs (account_id, payment_run_draft_id, forecast_run_id) in der Antwort.
- Mutationen erzeugst Du AUSSCHLIESSLICH über propose_*-Tools (Draft + Approval-Pfad). NIEMALS selbst ausführen.
- Sanctions: nur Hit-IDs und Match-Scores erwähnen; niemals Listen-Inhalte zitieren.
- Keine EBICS-Keys, keine HSM-Identifier, keine PII außerhalb des Mindest-Notwendigen.
- Default-Sprache: Deutsch. Wenn der Nutzer auf Englisch schreibt: Englisch.`;

const SYSTEM_PROMPT_EN = `You are the Treasury skill for the Orange Octo application. You answer questions about cash position, forecast, bank accounts, EBICS, payments, SEPA, sanctions, hedging and group consolidation.

Rules:
- Every answer that contains a figure/date MUST come from a tool call — never guess.
- Cite the IDs (account_id, payment_run_draft_id, forecast_run_id) in the reply.
- Mutations are created EXCLUSIVELY through propose_* tools (draft + approval path). NEVER execute on your own.
- Sanctions: mention only hit IDs and match scores; never quote list entry contents.
- No EBICS keys, no HSM identifiers, no PII beyond the minimum necessary.
- Default language: German. If the user writes in English: English.`;

const MAX_TOOL_ROUNDS = 6;
const MAX_OUTPUT_TOKENS = 1500;

// Minimal local types — the Bedrock SDK re-exports the Anthropic message
// shapes but we only need the discriminants used in the tool-loop.
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];
}

interface UserMessage {
  role: "user";
  content: ContentBlock[] | string;
}

type ChatMessage = AssistantMessage | UserMessage;

interface ChatRequestBody {
  message?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  language?: "de" | "en";
}

interface ChatResponseBody {
  ok: true;
  reply: string;
  language: "de" | "en";
  tool_trace: Array<{ name: string; input: Record<string, unknown>; output: unknown; error?: string }>;
  usage: { input_tokens: number; output_tokens: number; cache_read?: number; cache_creation?: number };
}

interface ChatErrorBody {
  ok: false;
  error: string;
}

export async function POST(
  request: Request,
): Promise<NextResponse<ChatResponseBody | ChatErrorBody>> {
  const ssr = await createServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Nicht authentifiziert" }, { status: 401 });
  }

  const service = createServiceClient();
  const appMeta = (user.app_metadata ?? {}) as { company_id?: string; active_company_id?: string };
  let companyId = appMeta.company_id ?? appMeta.active_company_id ?? null;
  if (!companyId) {
    const { data: member } = await service
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle<{ company_id: string }>();
    companyId = member?.company_id ?? null;
  }
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Keine aktive Company" }, { status: 400 });
  }

  const { data: sub } = await service
    .from("company_subscriptions")
    .select("has_treasury")
    .eq("company_id", companyId)
    .maybeSingle<{ has_treasury: boolean }>();
  if (!sub?.has_treasury) {
    return NextResponse.json(
      { ok: false, error: "Treasury-Modul nicht aktiviert" },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => null)) as ChatRequestBody | null;
  const message = body?.message?.trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });
  }
  const language: "de" | "en" = body?.language === "en" ? "en" : "de";

  // Bedrock-only — EU data plane is non-negotiable for the Treasury surface.
  const awsKey = process.env.AWS_ACCESS_KEY_ID;
  const awsSecret = process.env.AWS_SECRET_ACCESS_KEY;
  if (!awsKey || !awsSecret) {
    return NextResponse.json(
      { ok: false, error: "Bedrock credentials missing — Treasury skill requires AWS eu-central-1" },
      { status: 503 },
    );
  }

  const client = new AnthropicBedrock({
    awsAccessKey: awsKey,
    awsSecretKey: awsSecret,
    awsRegion: process.env.AWS_REGION || "eu-central-1",
  });
  const model = BEDROCK_MODEL;

  const tools = buildAnthropicToolDefinitions();
  const systemBlocks = [
    {
      type: "text" as const,
      text: language === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_DE,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const ctx: SkillContext = {
    supabase: ssr,
    companyId,
    userId: user.id,
    locale: language,
  };

  const messages: ChatMessage[] = [];
  for (const h of body?.history ?? []) {
    if (h.role === "user") messages.push({ role: "user", content: h.content });
    else if (h.role === "assistant")
      messages.push({ role: "assistant", content: [{ type: "text", text: h.content }] });
  }
  messages.push({ role: "user", content: message });

  const toolTrace: ChatResponseBody["tool_trace"] = [];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read: 0, cache_creation: 0 };
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemBlocks,
        tools: tools as unknown as Parameters<typeof client.messages.create>[0]["tools"],
        messages: messages as unknown as Parameters<typeof client.messages.create>[0]["messages"],
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Bedrock-Fehler";
      return NextResponse.json({ ok: false, error: `Bedrock: ${detail}` }, { status: 502 });
    }

    usage.input_tokens += response.usage?.input_tokens ?? 0;
    usage.output_tokens += response.usage?.output_tokens ?? 0;
    // Cache metrics are exposed by the SDK as optional fields; tolerate
    // absence to stay compatible with older runtimes.
    const cacheUsage = response.usage as unknown as {
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    usage.cache_read += cacheUsage?.cache_read_input_tokens ?? 0;
    usage.cache_creation += cacheUsage?.cache_creation_input_tokens ?? 0;

    const assistantBlocks = response.content as unknown as ContentBlock[];
    messages.push({ role: "assistant", content: assistantBlocks });

    if (response.stop_reason !== "tool_use") {
      finalText = assistantBlocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    const toolUses = assistantBlocks.filter(
      (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        b.type === "tool_use",
    );
    const toolResults: ContentBlock[] = [];
    for (const use of toolUses) {
      const result = await runTreasuryTool(use.name, use.input, ctx);
      if (result.ok) {
        toolTrace.push({ name: use.name, input: use.input, output: result.data });
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(result.data),
        });
      } else {
        toolTrace.push({ name: use.name, input: use.input, output: null, error: result.error });
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify({ error: result.error }),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (!finalText) {
    finalText =
      language === "en"
        ? "Tool loop exceeded the round limit — please refine your question."
        : "Die Tool-Schleife hat das Round-Limit überschritten — bitte präzisiere die Frage.";
  }

  return NextResponse.json({
    ok: true,
    reply: finalText,
    language,
    tool_trace: toolTrace,
    usage,
  });
}
