// SCH-825 M7 — Single comment resource.
//
//   PATCH  /api/pm/.../tasks/:taskId/comments/:commentId   (author only)
//   DELETE /api/pm/.../tasks/:taskId/comments/:commentId   (author OR admin)
//
// Edit re-runs mention resolution so the stored mentioned_user_ids stays
// canonical. RLS restricts who can update/delete; we still surface 403 on
// policy denial so the UI shows a useful message instead of a 500.

import { requirePmSession } from "@/lib/pm/auth";
import {
  COMMENT_COLUMNS,
  extractMentionCandidates,
  resolveMentions,
} from "@/lib/pm/comments";
import { listWorkspaceMembers } from "@/lib/pm/members";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      workspaceId: string;
      projectId: string;
      taskId: string;
      commentId: string;
    }>;
  },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { workspaceId, taskId, commentId } = await params;

  const reqBody = (await request.json().catch(() => null)) as
    | { body?: string }
    | null;

  const text = reqBody?.body?.trim();
  if (!text) {
    return Response.json(
      { error: "Kommentar darf nicht leer sein" },
      { status: 400 },
    );
  }

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
    .update({ body: text, mentioned_user_ids: mentionedIds })
    .eq("id", commentId)
    .eq("task_id", taskId)
    .select(COMMENT_COLUMNS)
    .maybeSingle();

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data) {
    return Response.json(
      { error: "Keine Berechtigung oder Kommentar nicht gefunden" },
      { status: 403 },
    );
  }
  return Response.json({ comment: res.data });
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      workspaceId: string;
      projectId: string;
      taskId: string;
      commentId: string;
    }>;
  },
) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const { taskId, commentId } = await params;

  const res = await session.sb
    .schema("pm")
    .from("task_comments")
    .delete()
    .eq("id", commentId)
    .eq("task_id", taskId)
    .select("id");

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  if (!res.data || res.data.length === 0) {
    return Response.json(
      { error: "Keine Berechtigung oder Kommentar nicht gefunden" },
      { status: 403 },
    );
  }
  return Response.json({ deleted: true });
}
