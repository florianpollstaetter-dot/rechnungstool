// SCH-825 M3 — Task types + status/priority metadata. Shared between API
// routes and UI so the workflow stays in one place. Mirrors the CHECK
// constraints in 20260504120000_pm_tasks.sql.

export const TASK_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type PmTask = {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string;
  assignee_user_id: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  position: number;
  custom_fields: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export const TASK_COLUMNS =
  "id, project_id, parent_task_id, title, description, assignee_user_id, due_date, priority, status, position, custom_fields, created_by, created_at, updated_at" as const;

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Arbeit",
  in_review: "Review",
  done: "Erledigt",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  urgent: "Dringend",
};

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
}

export function isTaskPriority(v: unknown): v is TaskPriority {
  return typeof v === "string" && (TASK_PRIORITIES as readonly string[]).includes(v);
}
