// SCH-825 M1 — Workspace detail. Server component: loads the workspace + the
// caller's role + the member list, then renders the invite form (admins only)
// and the members table.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMembers, type PmMember } from "@/lib/pm/members";
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
