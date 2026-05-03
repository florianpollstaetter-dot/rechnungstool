// SCH-825 M9 — Role helpers shared across RSC pages and client components.

export type WorkspaceRole = "admin" | "member" | "guest";

export function canWrite(role: WorkspaceRole | null | undefined): boolean {
  return role === "admin" || role === "member";
}

export function isAdminRole(role: WorkspaceRole | null | undefined): boolean {
  return role === "admin";
}
