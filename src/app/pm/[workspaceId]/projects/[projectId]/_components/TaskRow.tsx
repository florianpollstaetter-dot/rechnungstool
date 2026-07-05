"use client";

// SCH-825 M3 — Task row with inline edit + status quick-change. M7 adds a
// comment thread toggle. Used by the project detail page. Status changes
// save immediately on select; full edits expand a form below the row.
// Delete confirms via window.confirm.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type PmTask,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/pm/tasks";
import { CommentThread } from "./CommentThread";

type MemberOption = { user_id: string; display_name: string; email: string };

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: "text-[var(--text-muted)]",
  medium: "text-[var(--text-secondary)]",
  high: "text-amber-300",
  urgent: "text-red-300",
};

export function TaskRow({
  task,
  workspaceId,
  members,
  currentUserId,
  isAdmin,
  canWrite,
}: {
  task: PmTask;
  workspaceId: string;
  members: MemberOption[];
  currentUserId: string;
  isAdmin: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showingComments, setShowingComments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // edit form state
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [assigneeId, setAssigneeId] = useState(task.assignee_user_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);

  const baseUrl = `/api/pm/workspaces/${workspaceId}/projects/${task.project_id}/tasks/${task.id}`;
  const assigneeName = members.find((m) => m.user_id === task.assignee_user_id);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(baseUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Speichern fehlgeschlagen");
      return false;
    }
    return true;
  }

  async function handleStatusChange(newStatus: TaskStatus) {
    if (await patch({ status: newStatus })) {
      startTransition(() => router.refresh());
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (
      await patch({
        title: title.trim(),
        description,
        assignee_user_id: assigneeId || null,
        due_date: dueDate || null,
        priority,
      })
    ) {
      setEditing(false);
      startTransition(() => router.refresh());
    }
  }

  async function handleDelete() {
    if (!confirm(`Aufgabe „${task.title}" wirklich löschen?`)) return;
    setError(null);
    const res = await fetch(baseUrl, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Löschen fehlgeschlagen");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <li className="bg-[var(--surface)]">
      <div className="flex items-center gap-3 px-4 py-3">
        {canWrite ? (
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
            disabled={pending}
            className="text-xs bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-1 outline-none"
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs bg-[var(--background)] border border-[var(--border)] rounded-full px-2 py-0.5">
            {STATUS_LABEL[task.status as TaskStatus]}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{task.title}</div>
          <div className="text-xs text-[var(--text-muted)] flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {assigneeName && (
              <span>
                @{assigneeName.display_name || assigneeName.email || "—"}
              </span>
            )}
            {task.due_date && (
              <span>
                Fällig {new Date(task.due_date).toLocaleDateString("de-DE")}
              </span>
            )}
            <span className={PRIORITY_BADGE[task.priority]}>
              {PRIORITY_LABEL[task.priority]}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowingComments((v) => !v)}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {showingComments ? "💬 Schließen" : "💬 Kommentare"}
        </button>
        {canWrite && (
          <>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {editing ? "Schließen" : "Bearbeiten"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
            >
              Löschen
            </button>
          </>
        )}
      </div>

      {editing && (
        <form
          onSubmit={handleSaveEdit}
          className="px-4 pb-4 pt-1 space-y-3 border-t border-[var(--border)]"
        >
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Titel
            </span>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Beschreibung
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Zuweisen
              </span>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none"
              >
                <option value="">Niemand</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name || m.email || m.user_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Fällig
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Priorität
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-[var(--text-secondary)]"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending || !title.trim()}
              className="bg-[var(--accent)] text-black font-medium rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {pending ? "Speichert…" : "Speichern"}
            </button>
          </div>
        </form>
      )}

      {showingComments && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--border)]">
          <CommentThread
            workspaceId={workspaceId}
            projectId={task.project_id}
            taskId={task.id}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            canWrite={canWrite}
            members={members}
          />
        </div>
      )}

      {error && (
        <div className="px-4 pb-2 text-xs text-red-300">{error}</div>
      )}
    </li>
  );
}
