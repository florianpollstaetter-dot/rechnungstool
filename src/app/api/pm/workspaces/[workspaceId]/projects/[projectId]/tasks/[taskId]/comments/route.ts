// SCH-825 M7 — Comment collection (per task).
//
//   GET  /api/pm/workspaces/:wid/projects/:pid/tasks/:taskId/comments
//   POST /api/pm/workspaces/:wid/projects/:pid/tasks/:taskId/comments
//
// POST resolves @-mentions server-side against the workspace member list
// before insert so the stored array is canonical for M8 notifications.

import { requirePmSession } from "@/lib/pm/auth";
import {
  COMMENT_COLUMNS,
  extractMentionCandidates,
  resolveMentions,
} from "@/lib/pm/comments";
import { listWorkspaceMembers } from "@/lib/pm/members";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ workspaceId: string; projectId: string; taskId: string }>;
  },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { taskId } = await params;

  const res = await session.sb
    .schema("pm")
    .from("task_comments")
    .select(COMMENT_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  return Response.json({ comments: res.data ?? [] });
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ workspaceId: string; projectId: string; taskId: string }>;
  },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId, taskId } = await params;

  const body = (await request.json().catch(() => null)) as
    | { body?: string }
    | null;

  const text = body?.body?.trim();
  if (!text) {
    return Response.json({ error: "Kommentar darf nicht leer sein" }, { status: 400 });
  }

  // Mention resolution is best-effort: a member-list failure should not
  // silently swallow the comment, so we still post but with no mentions.
  const candidates = extractMentionCandidates(text);
  let mentionedIds: string[] = [];
  if (candidates.length > 0) {
    const membersResult = await listWorkspaceMembers(session.sb, workspaceId);
    const members = "members" in membersResult ? membersResult.members : [];
    mentionedIds = resolveMentions(
      candidates,
      members.map((m) => ({
        user_id: m.user_id,
        display_name: m.display_name,
        email: m.email,
      })),
    );
  }

  const res = await session.sb
    .schema("pm")
    .from("task_comments")
    .insert({
      task_id: taskId,
      author_user_id: session.user.id,
      body: text,
      mentioned_user_ids: mentionedIds,
    })
    .select(COMMENT_COLUMNS)
    .single();

  if (res.error) {
    const httpStatus =
      res.error.code === "42501" ||
      res.error.message?.toLowerCase().includes("policy")
        ? 403
        : 500;
    return Response.json({ error: res.error.message }, { status: httpStatus });
  }
  return Response.json({ comment: res.data }, { status: 201 });
}
