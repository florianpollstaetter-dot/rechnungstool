// SCH-825 M8 — Notification types. Trigger-driven fan-out writes the rows;
// the API just selects + marks read.

export const NOTIFICATION_TYPES = ["mention", "assigned"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type PmNotification = {
  id: string;
  recipient_user_id: string;
  workspace_id: string;
  type: NotificationType;
  task_id: string;
  comment_id: string | null;
  actor_user_id: string | null;
  read_at: string | null;
  created_at: string;
};

export const NOTIFICATION_COLUMNS =
  "id, recipient_user_id, workspace_id, type, task_id, comment_id, actor_user_id, read_at, created_at" as const;

export const TYPE_LABEL: Record<NotificationType, string> = {
  mention: "Erwähnt",
  assigned: "Zugewiesen",
};

// API GET shape: notification + embedded task for deep-link rendering.
export type PmNotificationWithTask = PmNotification & {
  task: { title: string; project_id: string } | null;
};
