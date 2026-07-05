"use client";

// SCH-825 M3 — Task create form. Inline at the top of the tasks section on
// the project detail page; posts to
// /api/pm/workspaces/:wid/projects/:pid/tasks and refreshes the RSC list.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PRIORITY_LABEL,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/lib/pm/tasks";

type MemberOption = { user_id: string; display_name: string; email: string };

export function CreateTaskForm({
  workspaceId,
  projectId,
  members,
}: {
  workspaceId: string;
  projectId: string;
  members: MemberOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch(
      `/api/pm/workspaces/${workspaceId}/projects/${projectId}/tasks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          assignee_user_id: assigneeId || null,
          due_date: dueDate || null,
          priority,
        }),
      },
    );
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json.error ?? "Anlegen fehlgeschlagen");
      return;
    }
    setTitle("");
    setDescription("");
    setAssigneeId("");
    setDueDate("");
    setPriority("medium");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
          Titel
        </span>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          placeholder="Was ist zu tun?"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
          Beschreibung (optional)
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
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
            className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
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
            className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Priorität
          </span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="bg-[var(--accent)] text-black font-medium rounded-md px-4 py-2 text-sm disabled:opacity-50"
      >
        {pending ? "Wird angelegt…" : "Aufgabe anlegen"}
      </button>
    </form>
  );
}
