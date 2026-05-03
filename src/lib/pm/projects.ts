// SCH-825 M2 — Project types + status metadata. Shared between API routes
// and UI so the status workflow stays in one place.

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type PmProject = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Geplant",
  active: "Aktiv",
  on_hold: "Pausiert",
  done: "Abgeschlossen",
};
