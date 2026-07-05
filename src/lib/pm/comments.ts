// SCH-825 M7 — Task-comment types + server-side @-mention parser. Mentions
// are resolved against the workspace member directory at write-time so the
// UI doesn't have to re-parse on render and M8 notifications can scan a
// single GIN-indexed array.

export type PmTaskComment = {
  id: string;
  task_id: string;
  author_user_id: string;
  body: string;
  mentioned_user_ids: string[];
  created_at: string;
  updated_at: string;
};

export const COMMENT_COLUMNS =
  "id, task_id, author_user_id, body, mentioned_user_ids, created_at, updated_at" as const;

// @<token> where token is letters/digits/dot/dash/underscore. Long enough to
// catch full names with dots ("anna.muster"); the API resolves it by exact
// case-insensitive match against the workspace member display_name or
// email-local-part, so silent typos don't accidentally page someone.
const MENTION_RE = /(^|[^A-Za-z0-9])@([A-Za-z0-9_.-]{2,64})/g;

export type MentionCandidate = { handle: string };

export function extractMentionCandidates(body: string): MentionCandidate[] {
  const out: MentionCandidate[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    const handle = m[2].toLowerCase();
    if (!seen.has(handle)) {
      seen.add(handle);
      out.push({ handle });
    }
  }
  return out;
}

export type WorkspaceMemberLookup = {
  user_id: string;
  display_name: string;
  email: string;
};

// Match a candidate against a member: display_name (case-insensitive,
// whitespace stripped) OR the local-part of the email. Stays exact — no
// fuzzy/partial — to avoid mis-mentions.
export function resolveMentions(
  candidates: MentionCandidate[],
  members: WorkspaceMemberLookup[],
): string[] {
  if (candidates.length === 0) return [];

  const byHandle = new Map<string, string>();
  for (const m of members) {
    const display = m.display_name.toLowerCase().replace(/\s+/g, "");
    if (display) byHandle.set(display, m.user_id);
    const local = m.email.split("@")[0]?.toLowerCase();
    if (local) byHandle.set(local, m.user_id);
  }

  const ids = new Set<string>();
  for (const c of candidates) {
    const id = byHandle.get(c.handle);
    if (id) ids.add(id);
  }
  return Array.from(ids);
}
