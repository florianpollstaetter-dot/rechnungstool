// SCH-825 M2+M3 — Project detail (RSC). Loads project, caller's workspace
// role, workspace member list (for the assignee dropdown), and tasks. M4
// will replace the flat list with a Kanban board view.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMembers } from "@/lib/pm/members";
import {
  STATUS_LABEL,
  type PmProject,
  type ProjectStatus,
} from "@/lib/pm/projects";
import { TASK_COLUMNS, type PmTask } from "@/lib/pm/tasks";
import { EditProjectForm } from "./_components/EditProjectForm";
import { CreateTaskForm } from "./_components/CreateTaskForm";
import { TaskRow } from "./_components/TaskRow";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    redirect(`/login?next=/pm/${workspaceId}/projects/${projectId}`);
  }

  const [wsRes, projectRes, meRes, tasksRes, membersResult] = await Promise.all([
    sb.schema("pm").from("workspaces").select("id, name, slug").eq("id", workspaceId).maybeSingle(),
    sb
      .schema("pm")
      .from("projects")
      .select("id, workspace_id, name, description, status, created_by, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("id", projectId)
      .maybeSingle(),
    sb
      .schema("pm")
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle(),
    sb
      .schema("pm")
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("project_id", projectId)
      .order("status", { ascending: true })
      .order("position", { ascending: true }),
    listWorkspaceMembers(sb, workspaceId),
  ]);

  if (projectRes.error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-sm text-red-300">Fehler: {projectRes.error.message}</p>
      </div>
    );
  }
  if (!projectRes.data || !wsRes.data) {
    notFound();
  }

  const project = projectRes.data as PmProject;
  const workspace = wsRes.data;
  const myRole = (meRes.data?.role as "admin" | "member" | "guest" | undefined) ?? null;
  const isAdmin = myRole === "admin";
  const canWrite = myRole === "admin" || myRole === "member";

  const tasks: PmTask[] = (tasksRes.data ?? []) as PmTask[];
  const tasksLoadError = tasksRes.error?.message ?? null;
  const members = "members" in membersResult ? membersResult.members : [];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      <nav className="text-sm">
        <Link
          href={`/pm/${workspaceId}`}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          ← {workspace.name}
        </Link>
      </nav>

      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{project.name}</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Erstellt {new Date(project.created_at).toLocaleDateString("de-DE")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wide bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1">
            {STATUS_LABEL[project.status as ProjectStatus]}
          </span>
          <Link
            href={`/pm/${workspaceId}/projects/${projectId}/board`}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline-offset-4 hover:underline"
          >
            Board
          </Link>
          <Link
            href={`/pm/${workspaceId}/projects/${projectId}/table`}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline-offset-4 hover:underline"
          >
            Tabelle
          </Link>
        </div>
      </header>

      {canWrite && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <h2 className="text-lg font-medium mb-4">Projekt bearbeiten</h2>
          <EditProjectForm project={project} isAdmin={isAdmin} />
        </section>
      )}

      {canWrite && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <h2 className="text-lg font-medium mb-4">Neue Aufgabe</h2>
          <CreateTaskForm
            workspaceId={workspaceId}
            projectId={projectId}
            members={members.map((m) => ({
              user_id: m.user_id,
              display_name: m.display_name,
              email: m.email,
            }))}
          />
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium mb-4">
          Aufgaben ({tasks.length})
        </h2>
        {tasksLoadError ? (
          <p className="text-sm text-red-300">{tasksLoadError}</p>
        ) : tasks.length === 0 ? (
          <div className="text-[var(--text-secondary)] text-sm border border-dashed border-[var(--border)] rounded-md p-6 text-center">
            Noch keine Aufgaben. Lege oben deine erste an.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                workspaceId={workspaceId}
                members={members.map((m) => ({
                  user_id: m.user_id,
                  display_name: m.display_name,
                  email: m.email,
                }))}
                currentUserId={user.id}
                isAdmin={isAdmin}
                canWrite={canWrite}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
