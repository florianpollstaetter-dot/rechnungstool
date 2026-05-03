// SCH-825 M1+M2 — Workspace detail (RSC). Loads workspace, caller's role,
// project list, and member list in parallel. Projects are the primary surface
// (CreateProjectForm + list); members are below for admin-side operations.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMembers, type PmMember } from "@/lib/pm/members";
import {
  STATUS_LABEL,
  type PmProject,
  type ProjectStatus,
} from "@/lib/pm/projects";
import { CreateProjectForm } from "./_components/CreateProjectForm";
import { InviteMemberForm } from "./_components/InviteMemberForm";
import { MembersTable } from "./_components/MembersTable";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    redirect(`/login?next=/pm/${workspaceId}`);
  }

  const wsRes = await sb
    .schema("pm")
    .from("workspaces")
    .select("id, name, slug, created_by, created_at")
    .eq("id", workspaceId)
    .maybeSingle();

  if (wsRes.error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-sm text-red-300">Fehler: {wsRes.error.message}</p>
      </div>
    );
  }
  if (!wsRes.data) {
    notFound();
  }

  const workspace = wsRes.data;

  const meRes = await sb
    .schema("pm")
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  const myRole: "admin" | "member" | "guest" | null =
    (meRes.data?.role as "admin" | "member" | "guest" | undefined) ?? null;
  const isAdmin = myRole === "admin";

  const memberResult = await listWorkspaceMembers(sb, workspaceId);
  const members: PmMember[] =
    "members" in memberResult ? memberResult.members : [];
  const memberLoadError =
    "error" in memberResult ? memberResult.error : null;

  const projectsRes = await sb
    .schema("pm")
    .from("projects")
    .select("id, workspace_id, name, description, status, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const projects: PmProject[] = (projectsRes.data ?? []) as PmProject[];
  const projectsLoadError = projectsRes.error?.message ?? null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      <nav className="text-sm">
        <Link
          href="/pm"
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          ← Workspaces
        </Link>
      </nav>

      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{workspace.name}</h1>
          <p className="text-xs font-mono text-[var(--text-muted)] mt-1">
            /{workspace.slug}
          </p>
        </div>
        <span className="text-xs uppercase tracking-wide bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1">
          {myRole ?? "kein Zugriff"}
        </span>
      </header>

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <h2 className="text-lg font-medium mb-4">Neues Projekt anlegen</h2>
        <CreateProjectForm workspaceId={workspaceId} />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-4">
          Projekte ({projects.length})
        </h2>
        {projectsLoadError ? (
          <p className="text-sm text-red-300">{projectsLoadError}</p>
        ) : projects.length === 0 ? (
          <div className="text-[var(--text-secondary)] text-sm border border-dashed border-[var(--border)] rounded-md p-6 text-center">
            Noch keine Projekte. Lege oben dein erstes an.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--surface)]">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/pm/${workspaceId}/projects/${p.id}`}
                  className="block px-5 py-4 hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <span className="font-medium block truncate">{p.name}</span>
                      {p.description && (
                        <span className="text-xs text-[var(--text-muted)] block truncate">
                          {p.description}
                        </span>
                      )}
                    </div>
                    <span className="text-xs uppercase tracking-wide bg-[var(--background)] border border-[var(--border)] rounded-full px-2 py-0.5 shrink-0">
                      {STATUS_LABEL[p.status as ProjectStatus]}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <h2 className="text-lg font-medium mb-4">Mitglied einladen</h2>
          <InviteMemberForm workspaceId={workspaceId} />
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium mb-4">
          Mitglieder ({members.length})
        </h2>
        {memberLoadError ? (
          <p className="text-sm text-red-300">{memberLoadError}</p>
        ) : (
          <MembersTable
            workspaceId={workspaceId}
            members={members}
            currentUserId={user.id}
            isAdmin={isAdmin}
          />
        )}
      </section>
    </div>
  );
}
