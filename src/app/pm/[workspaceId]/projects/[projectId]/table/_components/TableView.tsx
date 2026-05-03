"use client";

// SCH-825 M6 — Table view with inline-edit cells. Click a cell to edit;
// blur or Enter saves, Escape cancels. Uses the same PATCH endpoints as
// the list/board views so optimistic-then-confirm is consistent across
// surfaces. Status/priority/assignee render <select> in edit mode; due_date
// uses <input type="date">; title uses a free-text input.
//
// Read-only column: Erstellt. The full edit form (description, subtasks)
// stays on the project detail page row-edit; this view is for fast bulk
// edits across the spreadsheet axis.

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

type MemberOption = { user_id: string; display_name: string; email: string };

type EditableField =
  | "title"
  | "status"
  | "assignee_user_id"
  | "due_date"
  | "priority";

type ActiveCell = { taskId: string; field: EditableField } | null;

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: "text-[var(--text-muted)]",
  medium: "text-[var(--text-secondary)]",
  high: "text-amber-300",
  urgent: "text-red-300",
};

export function TableView({
  workspaceId,
  projectId,
  tasks,
  members,
  canWrite,
}: {
  workspaceId: string;
  projectId: string;
  tasks: PmTask[];
  members: MemberOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState<ActiveCell>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const memberById = new Map<string, MemberOption>(
    members.map((m) => [m.user_id, m]),
  );

  async function patchField(
    taskId: string,
    body: Partial<Pick<PmTask, EditableField>>,
  ) {
    setError(null);
    const res = await fetch(
      `/api/pm/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Speichern fehlgeschlagen");
      return false;
    }
    return true;
  }

  async function commitField(
    taskId: string,
    field: EditableField,
    value: string | null,
    original: string | null,
  ) {
    setActive(null);
    if (value === original) return;
    const ok = await patchField(taskId, {
      [field]: value,
    } as Partial<Pick<PmTask, EditableField>>);
    if (ok) {
      startTransition(() => router.refresh());
    }
  }

  function isActive(taskId: string, field: EditableField) {
    return active?.taskId === taskId && active.field === field;
  }

  if (tasks.length === 0) {
    return (
      <div className="text-[var(--text-secondary)] text-sm border border-dashed border-[var(--border)] rounded-md p-8 text-center">
        Noch keine Aufgaben — leg eine auf der Projekt-Seite an.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface)] text-[var(--text-muted)] text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-3 py-2 w-32">Status</th>
              <th className="text-left font-medium px-3 py-2">Titel</th>
              <th className="text-left font-medium px-3 py-2 w-48">Zuweisung</th>
              <th className="text-left font-medium px-3 py-2 w-32">Fällig</th>
              <th className="text-left font-medium px-3 py-2 w-28">Priorität</th>
              <th className="text-left font-medium px-3 py-2 w-28">Erstellt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {tasks.map((t) => {
              const assignee = t.assignee_user_id
                ? memberById.get(t.assignee_user_id)
                : null;
              return (
                <tr key={t.id} className="hover:bg-[var(--surface-hover)]">
                  {/* Status */}
                  <td
                    className={`px-3 py-2 ${canWrite ? "cursor-pointer" : ""}`}
                    onClick={() =>
                      canWrite && setActive({ taskId: t.id, field: "status" })
                    }
                  >
                    {isActive(t.id, "status") ? (
                      <select
                        autoFocus
                        defaultValue={t.status}
                        onBlur={(e) =>
                          commitField(t.id, "status", e.target.value, t.status)
                        }
                        onChange={(e) =>
                          commitField(t.id, "status", e.target.value, t.status)
                        }
                        className="bg-[var(--background)] border border-[var(--accent)] rounded-md px-2 py-1 text-xs"
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-block bg-[var(--background)] border border-[var(--border)] rounded-full px-2 py-0.5 text-xs">
                        {STATUS_LABEL[t.status as TaskStatus]}
                      </span>
                    )}
                  </td>

                  {/* Title */}
                  <td
                    className={`px-3 py-2 font-medium ${
                      canWrite ? "cursor-text" : ""
                    }`}
                    onClick={() =>
                      canWrite && setActive({ taskId: t.id, field: "title" })
                    }
                  >
                    {isActive(t.id, "title") ? (
                      <input
                        autoFocus
                        defaultValue={t.title}
                        onBlur={(e) =>
                          commitField(t.id, "title", e.target.value.trim(), t.title)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            setActive(null);
                          }
                        }}
                        className="bg-[var(--background)] border border-[var(--accent)] rounded-md px-2 py-1 text-sm w-full"
                      />
                    ) : (
                      <span>{t.title}</span>
                    )}
                  </td>

                  {/* Assignee */}
                  <td
                    className={`px-3 py-2 text-[var(--text-secondary)] ${
                      canWrite ? "cursor-pointer" : ""
                    }`}
                    onClick={() =>
                      canWrite &&
                      setActive({ taskId: t.id, field: "assignee_user_id" })
                    }
                  >
                    {isActive(t.id, "assignee_user_id") ? (
                      <select
                        autoFocus
                        defaultValue={t.assignee_user_id ?? ""}
                        onBlur={(e) =>
                          commitField(
                            t.id,
                            "assignee_user_id",
                            e.target.value || null,
                            t.assignee_user_id,
                          )
                        }
                        onChange={(e) =>
                          commitField(
                            t.id,
                            "assignee_user_id",
                            e.target.value || null,
                            t.assignee_user_id,
                          )
                        }
                        className="bg-[var(--background)] border border-[var(--accent)] rounded-md px-2 py-1 text-xs w-full"
                      >
                        <option value="">— niemand —</option>
                        {members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.display_name || m.email || m.user_id}
                          </option>
                        ))}
                      </select>
                    ) : assignee ? (
                      <span>
                        {assignee.display_name || assignee.email || "—"}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>

                  {/* Due date */}
                  <td
                    className={`px-3 py-2 ${canWrite ? "cursor-pointer" : ""}`}
                    onClick={() =>
                      canWrite && setActive({ taskId: t.id, field: "due_date" })
                    }
                  >
                    {isActive(t.id, "due_date") ? (
                      <input
                        autoFocus
                        type="date"
                        defaultValue={t.due_date ?? ""}
                        onBlur={(e) =>
                          commitField(
                            t.id,
                            "due_date",
                            e.target.value || null,
                            t.due_date,
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setActive(null);
                        }}
                        className="bg-[var(--background)] border border-[var(--accent)] rounded-md px-2 py-1 text-xs"
                      />
                    ) : t.due_date ? (
                      <span>
                        {new Date(t.due_date).toLocaleDateString("de-DE")}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>

                  {/* Priority */}
                  <td
                    className={`px-3 py-2 ${PRIORITY_BADGE[t.priority]} ${
                      canWrite ? "cursor-pointer" : ""
                    }`}
                    onClick={() =>
                      canWrite && setActive({ taskId: t.id, field: "priority" })
                    }
                  >
                    {isActive(t.id, "priority") ? (
                      <select
                        autoFocus
                        defaultValue={t.priority}
                        onBlur={(e) =>
                          commitField(
                            t.id,
                            "priority",
                            e.target.value,
                            t.priority,
                          )
                        }
                        onChange={(e) =>
                          commitField(
                            t.id,
                            "priority",
                            e.target.value,
                            t.priority,
                          )
                        }
                        className="bg-[var(--background)] border border-[var(--accent)] rounded-md px-2 py-1 text-xs"
                      >
                        {TASK_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABEL[p]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{PRIORITY_LABEL[t.priority]}</span>
                    )}
                  </td>

                  {/* Created (read-only) */}
                  <td className="px-3 py-2 text-[var(--text-muted)] text-xs">
                    {new Date(t.created_at).toLocaleDateString("de-DE")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        {canWrite
          ? "Zelle anklicken zum Bearbeiten. Speichern beim Verlassen oder mit Enter."
          : "Als Gast hast du nur Leserechte."}
      </p>
    </div>
  );
}
