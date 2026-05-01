// SCH-961 — In-app Bug-Reporter Phase 1.
//
// Authenticated end-users submit a structured bug report from the chat
// widget. We:
//   1) rate-limit (max 5 bug reports / user / hour)
//   2) create a Paperclip issue (assigned to the Engineer agent)
//   3) flag the chat_conversations row (is_bug_report=true, status='escalated')
//   4) drop a system message into the thread with a deep link to the issue
// so the operator console can render a "BUG" badge + a clickable link to
// the engineering ticket.

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";
import { logAndSanitize } from "@/lib/api-errors";

const PAPERCLIP_API_URL = process.env.PAPERCLIP_API_URL || "https://www.paperclip.ing";
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY;
const PAPERCLIP_COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID || "91cbce66-41cf-47d2-93eb-ef39fc272044";
const PAPERCLIP_ENGINEER_AGENT_ID = process.env.PAPERCLIP_ENGINEER_AGENT_ID || "d592c097-9622-4416-b678-420642184123";
const PAPERCLIP_PARENT_ISSUE_ID = process.env.PAPERCLIP_BUG_PARENT_ISSUE_ID || "78185024-7c2a-44d4-93c4-2e2b135bb500"; // SCH-425

const MAX_REPORTS_PER_HOUR = 5;
const MAX_FIELD_LEN = 4000;
const ISSUE_PREFIX = "SCH";

interface BugReportBody {
  conversation_id?: string;
  reproduce_steps?: string;
  expected?: string;
  actual?: string;
  browser?: string;
  screenshot_data_url?: string;
}

function clip(s: string | undefined | null, max = MAX_FIELD_LEN): string {
  const t = (s || "").trim();
  return t.length > max ? t.slice(0, max) + " […]" : t;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as BugReportBody | null;
  if (!body) return Response.json({ error: "invalid body" }, { status: 400 });

  const reproduce = clip(body.reproduce_steps);
  const expected = clip(body.expected);
  const actual = clip(body.actual);
  const browser = clip(body.browser, 500);
  const conversationId = body.conversation_id?.trim();

  if (!reproduce || !actual) {
    return Response.json({ error: "reproduce_steps and actual are required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Resolve company context — prefer the conversation's company_id, fall back
  // to the user's anchor company from user_profiles if the conversation has
  // not been created yet (rare; report-bug is normally invoked mid-thread).
  let companyId: string | null = null;
  let conversationRow: { id: string; company_id: string; user_id: string } | null = null;
  if (conversationId) {
    const { data } = await service
      .from("chat_conversations")
      .select("id, company_id, user_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (data && data.user_id === user.id) {
      conversationRow = data;
      companyId = data.company_id;
    }
  }
  if (!companyId) {
    const { data: profile } = await service
      .from("user_profiles")
      .select("anchor_company_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    companyId = profile?.anchor_company_id || null;
  }

  // Rate limit — count bug reports by this user in the last hour.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await service
    .from("chat_conversations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_bug_report", true)
    .gte("updated_at", oneHourAgo);
  if ((recentCount || 0) >= MAX_REPORTS_PER_HOUR) {
    return Response.json(
      { error: "rate_limited", message: "Du hast in der letzten Stunde zu viele Bug-Reports gesendet. Bitte später erneut versuchen." },
      { status: 429 },
    );
  }

  // Build a concise title from the first line of reproduce or actual.
  const titleSeed = (actual.split("\n")[0] || reproduce.split("\n")[0] || "Bug-Report").slice(0, 100);
  const title = `[Chatbot Bug-Report] ${titleSeed}`;

  // Description for the Paperclip issue — keep it markdown so the engineer
  // can pick it up directly.
  const description = [
    `## Reported via in-app chatbot`,
    ``,
    `- **User:** ${user.email || user.id}`,
    `- **Company:** ${companyId || "(unknown)"}`,
    `- **Conversation:** ${conversationRow?.id || "(none)"}`,
    `- **Browser:** ${browser || "(not provided)"}`,
    `- **Submitted:** ${new Date().toISOString()}`,
    ``,
    `### What did you do?`,
    reproduce,
    ``,
    `### What did you expect?`,
    expected || "_(not provided)_",
    ``,
    `### What happened instead?`,
    actual,
    body.screenshot_data_url ? `\n_Screenshot attached separately by user._` : "",
  ].join("\n");

  // Create the Paperclip issue if we can. If the API key is unavailable we
  // still complete the local-side flow so the operator inbox surfaces the
  // bug (engineer can pick it up from there manually).
  let issueIdentifier: string | null = null;
  let issueId: string | null = null;
  let paperclipError: string | null = null;
  if (PAPERCLIP_API_KEY) {
    try {
      const resp = await fetch(`${PAPERCLIP_API_URL}/api/companies/${PAPERCLIP_COMPANY_ID}/issues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PAPERCLIP_API_KEY}`,
        },
        body: JSON.stringify({
          title,
          description,
          status: "todo",
          priority: "high",
          assigneeAgentId: PAPERCLIP_ENGINEER_AGENT_ID,
          parentId: PAPERCLIP_PARENT_ISSUE_ID,
        }),
      });
      if (!resp.ok) {
        paperclipError = `paperclip ${resp.status}`;
        console.error("chat/report-bug: paperclip create failed", resp.status, await resp.text().catch(() => ""));
      } else {
        const issue = await resp.json();
        issueId = issue?.id || null;
        issueIdentifier = issue?.identifier || null;
      }
    } catch (err) {
      paperclipError = logAndSanitize("chat/report-bug:paperclip", err, "paperclip unreachable");
    }
  } else {
    paperclipError = "PAPERCLIP_API_KEY not configured";
    console.warn("chat/report-bug: PAPERCLIP_API_KEY not set — issue creation skipped");
  }

  // If we still don't have a conversation row, create one now so the bug
  // shows up in the operator inbox even if the user clicked "Bug melden"
  // before sending any chat message.
  let workingConversationId = conversationRow?.id || null;
  if (!workingConversationId && companyId) {
    const { data: newConv } = await service
      .from("chat_conversations")
      .insert({
        company_id: companyId,
        user_id: user.id,
        title: `Bug: ${titleSeed}`,
      })
      .select("id")
      .single();
    workingConversationId = newConv?.id || null;
  }

  if (workingConversationId) {
    const issueLink = issueIdentifier
      ? `/${ISSUE_PREFIX}/issues/${issueIdentifier}`
      : null;

    await service
      .from("chat_conversations")
      .update({
        is_bug_report: true,
        status: "escalated",
        escalated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        last_message_role: "system",
        updated_at: new Date().toISOString(),
      })
      .eq("id", workingConversationId);

    const summaryLine = issueIdentifier
      ? `BUG REPORT — Paperclip Issue ${issueIdentifier}`
      : `BUG REPORT — eingegangen, wartet auf Engineering`;
    await service.from("chat_messages").insert({
      conversation_id: workingConversationId,
      role: "system",
      content: summaryLine,
      metadata: {
        kind: "bug_report",
        issue_id: issueId,
        issue_identifier: issueIdentifier,
        issue_link: issueLink,
        reproduce_steps: reproduce,
        expected: expected || null,
        actual,
        browser: browser || null,
      },
    });
  }

  return Response.json({
    ok: true,
    conversation_id: workingConversationId,
    issue_id: issueId,
    issue_identifier: issueIdentifier,
    paperclip_error: paperclipError,
  });
}
