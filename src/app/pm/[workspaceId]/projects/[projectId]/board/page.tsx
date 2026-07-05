// SCH-825 M4 — Kanban board view. Loads project + tasks ordered by
// (status, position) and groups them into the four status columns. M5 adds
// drag-and-drop on top of these cards; M4 itself is read-only presentation
// with a status quick-change select per card to stay consistent with the
// list view in /projects/[id]/page.tsx.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  STATUS_LABEL as PROJECT_STATUS_LABEL,
  type PmProject,
  type ProjectStatus,
} from "@/lib/pm/projects";
import {
  TASK_COLUMNS,
  TASK_STATUSES,
  type PmTask,
  type TaskStatus,
} from "@/lib/pm/tasks";
import { RealtimeRefresher } from "@/lib/pm/RealtimeRefresher";
import { BoardView } from "./_components/BoardView";

export const dynamic = "force-dynamic";

export default async function ProjectBoardPage({
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
    redirect(`/login?next=/pm/${workspaceId}/projects/${projectId}/board`);
  }

  const [wsRes, projectRes, tasksRes, meRes] = await Promise.all([
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
  const allTasks: PmTask[] = (tasksRes.data ?? []) as PmTask[];
  const loadError = tasksRes.error?.message ?? null;
  const myRole = (meRes.data?.role as "admin" | "member" | "guest" | undefined) ?? null;
  const canWrite = myRole === "admin" || myRole === "member";

  const tasksByStatus: Record<TaskStatus, PmTask[]> = {
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
  };
  for (const t of allTasks) {
    tasksByStatus[t.status].push(t);
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
      <RealtimeRefresher
        subs={[
          {
            table: "tasks",
            filter: `project_id=eq.${projectId}`,
            channelKey: `project=${projectId}:board`,
          },
        ]}
      />
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
          <h1 className="text-3xl font-semibold">{project.name} — Board</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {allTasks.length} Aufgaben
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
            href={`/pm/${workspaceId}/projects/${projectId}/table`}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline-offset-4 hover:underline"
          >
            Tabelle
          </Link>
        </div>
      </header>

      {loadError && (
        <p className="text-sm text-red-300">{loadError}</p>
      )}

      <BoardView
        workspaceId={workspaceId}
        projectId={projectId}
        statuses={TASK_STATUSES}
        tasksByStatus={tasksByStatus}
        canWrite={canWrite}
      />
    </div>
  );
}
