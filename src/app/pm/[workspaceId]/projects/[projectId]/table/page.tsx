// SCH-825 M6 — Table view (RSC). Same data source as the list/board views;
// the client component renders a tabular layout with click-to-edit cells.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMembers } from "@/lib/pm/members";
import {
  STATUS_LABEL as PROJECT_STATUS_LABEL,
  type PmProject,
  type ProjectStatus,
} from "@/lib/pm/projects";
import { TASK_COLUMNS, type PmTask } from "@/lib/pm/tasks";
import { TableView } from "./_components/TableView";

export const dynamic = "force-dynamic";

export default async function ProjectTablePage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    redirect(`/login?next=/pm/${workspaceId}/projects/${projectId}/table`);
  }

  const [wsRes, projectRes, tasksRes, membersResult, meRes] = await Promise.all([
    sb
      .schema("pm")
      .from("workspaces")
      .select("id, name, slug")
      .eq("id", workspaceId)
      .maybeSingle(),
    sb
      .schema("pm")
      .from("projects")
      .select("id, workspace_id, name, description, status, created_by, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("id", projectId)
      .maybeSingle(),
    sb
      .schema("pm")
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("project_id", projectId)
      .is("parent_task_id", null)
      .order("status", { ascending: true })
      .order("position", { ascending: true }),
    listWorkspaceMembers(sb, workspaceId),
    sb
      .schema("pm")
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (projectRes.error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <p className="text-sm text-red-300">Fehler: {projectRes.error.message}</p>
      </div>
    );
  }
  if (!projectRes.data || !wsRes.data) {
    notFound();
  }

  const project = projectRes.data as PmProject;
  const workspace = wsRes.data;
  const tasks: PmTask[] = (tasksRes.data ?? []) as PmTask[];
  const loadError = tasksRes.error?.message ?? null;
  const members = "members" in membersResult ? membersResult.members : [];
  const myRole = (meRes.data?.role as "admin" | "member" | "guest" | undefined) ?? null;
  const canWrite = myRole === "admin" || myRole === "member";

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
      <nav className="text-sm">
        <Link
          href={`/pm/${workspaceId}/projects/${projectId}`}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          ← {workspace.name} / {project.name}
        </Link>
      </nav>

      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{project.name} — Tabelle</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {tasks.length} Aufgaben
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wide bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1">
            {PROJECT_STATUS_LABEL[project.status as ProjectStatus]}
          </span>
          <Link
            href={`/pm/${workspaceId}/projects/${projectId}`}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline-offset-4 hover:underline"
          >
            Liste
          </Link>
          <Link
            href={`/pm/${workspaceId}/projects/${projectId}/board`}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline-offset-4 hover:underline"
          >
            Board
          </Link>
        </div>
      </header>

      {loadError && <p className="text-sm text-red-300">{loadError}</p>}

      <TableView
        workspaceId={workspaceId}
        projectId={projectId}
        tasks={tasks}
        canWrite={canWrite}
        members={members.map((m) => ({
          user_id: m.user_id,
          display_name: m.display_name,
          email: m.email,
        }))}
      />
    </div>
  );
}
