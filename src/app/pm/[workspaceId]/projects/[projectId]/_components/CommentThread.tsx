"use client";

// SCH-825 M7 — Comment thread for a task. Lazy-loads on mount; renders the
// list, a new-comment form with @-mention autocomplete (simple substring
// match, the API does the canonical resolution server-side), and a delete
// button per comment that's visible to the author or workspace admin.

import { useEffect, useState } from "react";
import type { PmTaskComment } from "@/lib/pm/comments";

type MemberOption = {
  user_id: string;
  display_name: string;
  email: string;
};

export function CommentThread({
  workspaceId,
  projectId,
  taskId,
  currentUserId,
  isAdmin,
  canWrite,
  members,
}: {
  workspaceId: string;
  projectId: string;
  taskId: string;
  currentUserId: string;
  isAdmin: boolean;
  canWrite: boolean;
  members: MemberOption[];
}) {
  const baseUrl = `/api/pm/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`;

  const [comments, setComments] = useState<PmTaskComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const memberById = new Map(members.map((m) => [m.user_id, m]));

  function memberLabel(userId: string): string {
    const m = memberById.get(userId);
    if (!m) return userId.slice(0, 8);
    return m.display_name || m.email || userId.slice(0, 8);
  }

  async function reload() {
    setError(null);
    const res = await fetch(baseUrl);
    if (!res.ok) {
      setError("Kommentare konnten nicht geladen werden");
      return;
    }
    const json = (await res.json()) as { comments: PmTaskComment[] };
    setComments(json.comments);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    setError(null);
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft.trim() }),
    });
    setPosting(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Senden fehlgeschlagen");
      return;
    }
    setDraft("");
    setComments((prev) => (prev ? [...prev, json.comment] : [json.comment]));
  }

  async function handleDelete(c: PmTaskComment) {
    if (!confirm("Kommentar löschen?")) return;
    setError(null);
    const res = await fetch(`${baseUrl}/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Löschen fehlgeschlagen");
      return;
    }
    setComments((prev) => prev?.filter((x) => x.id !== c.id) ?? null);
  }

  return (
    <div className="space-y-3 mt-2">
      {error && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/40 rounded-md px-2 py-1">
          {error}
        </div>
      )}

      {comments === null ? (
        <p className="text-xs text-[var(--text-muted)]">Lade Kommentare…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          Noch keine Kommentare. Mit{" "}
          <code className="text-[var(--text-secondary)]">@name</code> kannst du
          Mitglieder erwähnen.
        </p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => {
            const canDelete = c.author_user_id === currentUserId || isAdmin;
            return (
              <li
                key={c.id}
                className="bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text-secondary)]">
                    {memberLabel(c.author_user_id)}
                  </span>
                  <span className="flex items-center gap-2">
                    <time dateTime={c.created_at}>
                      {new Date(c.created_at).toLocaleString("de-DE")}
                    </time>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        className="text-red-300 hover:text-red-200"
                      >
                        löschen
                      </button>
                    )}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap mt-1">{c.body}</p>
                {c.mentioned_user_ids.length > 0 && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Erwähnt:{" "}
                    {c.mentioned_user_ids
                      .map((id) => memberLabel(id))
                      .join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite ? (
        <form onSubmit={handlePost} className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Kommentar schreiben — @name erwähnt Mitglieder"
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={posting || !draft.trim()}
            className="bg-[var(--accent)] text-black font-medium rounded-md px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {posting ? "Sendet…" : "Senden"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          Als Gast hast du nur Leserechte.
        </p>
      )}
    </div>
  );
}
