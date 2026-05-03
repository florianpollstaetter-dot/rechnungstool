"use client";

// SCH-825 M4 + M5 — Board view (4 status columns) with HTML5 drag-and-drop
// between columns. Cards still expose a status quick-change select as a
// keyboard-accessible / touch-friendly fallback because native HTML5 DnD
// has no touch support and is awkward without a mouse.
//
// Drop semantics: dropping a card on a different column updates both
// status (to the target column) and position (max position in target + 1)
// in a single PATCH. Same-column drops are no-ops in M5; intra-column
// reordering is intentionally deferred — Florian's M5 acceptance is
// "Drag-and-Drop zwischen Status-Spalten" (between columns), and the
// position column already supports midpoint inserts when we add it.

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

const DRAG_MIME = "application/x-pm-task-id";

export function BoardView({
  workspaceId,
  projectId,
  statuses,
  tasksByStatus,
  canWrite,
}: {
  workspaceId: string;
  projectId: string;
  statuses: typeof TASK_STATUSES;
  tasksByStatus: Record<TaskStatus, PmTask[]>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Flat lookup so the drop handler can find the source task and decide
  // whether the move is a status change or a same-column no-op.
  const taskById = new Map<string, PmTask>();
  for (const status of statuses) {
    for (const t of tasksByStatus[status]) taskById.set(t.id, t);
  }

  async function moveTask(taskId: string, targetStatus: TaskStatus) {
    if (!canWrite) return;
    const task = taskById.get(taskId);
    if (!task) return;
    if (task.status === targetStatus) return;

    const targetColumn = tasksByStatus[targetStatus];
    const maxPos = targetColumn.length
      ? Math.max(...targetColumn.map((t) => t.position))
      : 0;
    const newPosition = maxPos + 1;

    setError(null);
    const res = await fetch(
      `/api/pm/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus, position: newPosition }),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Verschieben fehlgeschlagen");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function handleStatusSelect(taskId: string, newStatus: TaskStatus) {
    if (!canWrite) return;
    setError(null);
    const res = await fetch(
      `/api/pm/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`,
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
    <div className="space-y-2">
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statuses.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            isDragOver={dragOver === status}
            isPending={pending}
            canWrite={canWrite}
            onDragEnter={() => canWrite && setDragOver(status)}
            onDragLeave={() => setDragOver((curr) => (curr === status ? null : curr))}
            onDrop={(taskId) => {
              setDragOver(null);
              void moveTask(taskId, status);
            }}
            onStatusSelect={handleStatusSelect}
          />
        ))}
      </div>
    </div>
  );
}

function BoardColumn({
  status,
  tasks,
  isDragOver,
  isPending,
  canWrite,
  onDragEnter,
  onDragLeave,
  onDrop,
  onStatusSelect,
}: {
  status: TaskStatus;
  tasks: PmTask[];
  isDragOver: boolean;
  isPending: boolean;
  canWrite: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (taskId: string) => void;
  onStatusSelect: (taskId: string, newStatus: TaskStatus) => void;
}) {
  return (
    <div
      data-board-column={status}
      data-drag-over={isDragOver ? "true" : undefined}
      onDragOver={(e) => {
        if (!canWrite) return;
        // preventDefault is required to allow drop on this element.
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDragEnter={(e) => {
        if (!canWrite) return;
        if (e.dataTransfer.types.includes(DRAG_MIME)) onDragEnter();
      }}
      onDragLeave={(e) => {
        // Only fire leave when the cursor actually exits the column, not when
        // it crosses a child element. relatedTarget is the element entered;
        // currentTarget is this column. If still inside, ignore.
        if (
          e.relatedTarget instanceof Node &&
          e.currentTarget.contains(e.relatedTarget)
        ) {
          return;
        }
        onDragLeave();
      }}
      onDrop={(e) => {
        if (!canWrite) return;
        const taskId = e.dataTransfer.getData(DRAG_MIME);
        if (taskId) onDrop(taskId);
      }}
      className={
        "border rounded-lg flex flex-col min-h-[24rem] transition-colors " +
        (isDragOver
          ? "bg-[var(--surface)] border-[var(--accent)]"
          : "bg-[var(--surface)] border-[var(--border)]")
      }
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
              isPending={isPending}
              canWrite={canWrite}
              onStatusSelect={onStatusSelect}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function BoardCard({
  task,
  isPending,
  canWrite,
  onStatusSelect,
}: {
  task: PmTask;
  isPending: boolean;
  canWrite: boolean;
  onStatusSelect: (taskId: string, newStatus: TaskStatus) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <li
      data-board-card={task.id}
      data-board-card-status={task.status}
      draggable={canWrite}
      onDragStart={(e) => {
        if (!canWrite) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData(DRAG_MIME, task.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={
        "bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm space-y-1 " +
        (canWrite ? "cursor-grab active:cursor-grabbing " : "") +
        (dragging ? "opacity-50" : "")
      }
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
      {canWrite ? (
        <div className="flex items-center justify-between gap-2 pt-1">
          <select
            value={task.status}
            onChange={(e) =>
              onStatusSelect(task.id, e.target.value as TaskStatus)
            }
            disabled={isPending}
            className="text-xs bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1 outline-none flex-1"
            aria-label="Status ändern"
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </li>
  );
}
