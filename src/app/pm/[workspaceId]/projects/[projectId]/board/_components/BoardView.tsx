"use client";

// SCH-825 M4 — Board view (4 status columns). Cards expose a status
// quick-change select so column moves work without a full edit modal. M5
// will add drag-and-drop on top of this same DOM by hooking onto the cards.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  type PmTask,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/pm/tasks";

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: "text-[var(--text-muted)]",
  medium: "text-[var(--text-secondary)]",
  high: "text-amber-300",
  urgent: "text-red-300",
};

export function BoardView({
  workspaceId,
  projectId,
  statuses,
  tasksByStatus,
}: {
  workspaceId: string;
  projectId: string;
  statuses: typeof TASK_STATUSES;
  tasksByStatus: Record<TaskStatus, PmTask[]>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {statuses.map((status) => (
        <BoardColumn
          key={status}
          status={status}
          tasks={tasksByStatus[status]}
          workspaceId={workspaceId}
          projectId={projectId}
        />
      ))}
    </div>
  );
}

function BoardColumn({
  status,
  tasks,
  workspaceId,
  projectId,
}: {
  status: TaskStatus;
  tasks: PmTask[];
  workspaceId: string;
  projectId: string;
}) {
  return (
    <div
      data-board-column={status}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg flex flex-col min-h-[24rem]"
    >
      <header className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <h2 className="text-sm font-medium">{STATUS_LABEL[status]}</h2>
        <span className="text-xs text-[var(--text-muted)] tabular-nums">
          {tasks.length}
        </span>
      </header>
      <ul className="flex-1 p-2 space-y-2">
        {tasks.length === 0 ? (
          <li className="text-xs text-[var(--text-muted)] text-center py-6">
            Keine Aufgaben.
          </li>
        ) : (
          tasks.map((task) => (
            <BoardCard
              key={task.id}
              task={task}
              workspaceId={workspaceId}
              projectId={projectId}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function BoardCard({
  task,
  workspaceId,
  projectId,
}: {
  task: PmTask;
  workspaceId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleStatusChange(newStatus: TaskStatus) {
    setError(null);
    const res = await fetch(
      `/api/pm/workspaces/${workspaceId}/projects/${projectId}/tasks/${task.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Speichern fehlgeschlagen");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <li
      data-board-card={task.id}
      className="bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm space-y-1"
    >
      <div className="font-medium leading-snug break-words">{task.title}</div>
      <div className="text-xs text-[var(--text-muted)] flex flex-wrap gap-x-2 gap-y-0.5">
        {task.due_date && (
          <span>
            {new Date(task.due_date).toLocaleDateString("de-DE", {
              day: "2-digit",
              month: "2-digit",
            })}
          </span>
        )}
        <span className={PRIORITY_BADGE[task.priority]}>
          {PRIORITY_LABEL[task.priority]}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <select
          value={task.status}
          onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
          disabled={pending}
          className="text-xs bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1 outline-none flex-1"
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}
    </li>
  );
}
