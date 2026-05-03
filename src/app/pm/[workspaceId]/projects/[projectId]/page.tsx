// SCH-825 M2 — Project detail (RSC). Loads the project + caller's workspace
// role, then renders the edit form. M3 will add a tasks section under the
// "Aufgaben" placeholder.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  STATUS_LABEL,
  type PmProject,
  type ProjectStatus,
} from "@/lib/pm/projects";
import { EditProjectForm } from "./_components/EditProjectForm";

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

  const [wsRes, projectRes, meRes] = await Promise.all([
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

      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{project.name}</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Erstellt {new Date(project.created_at).toLocaleDateString("de-DE")}
          </p>
        </div>
        <span className="text-xs uppercase tracking-wide bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1">
          {STATUS_LABEL[project.status as ProjectStatus]}
        </span>
      </header>

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <h2 className="text-lg font-medium mb-4">Projekt bearbeiten</h2>
        <EditProjectForm project={project} isAdmin={isAdmin} />
      </section>

      <section className="border border-dashed border-[var(--border)] rounded-lg p-6 text-sm text-[var(--text-secondary)]">
        Aufgaben kommen in M3.
      </section>
    </div>
  );
}
