// SCH-825 M1 — Workspace list (RSC). Lists every workspace the caller is a
// member of (RLS-filtered by pm.is_workspace_member). Create-form is the only
// client island.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateWorkspaceForm } from "./_components/CreateWorkspaceForm";

export const dynamic = "force-dynamic";

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export default async function PmHomePage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    redirect("/login?next=/pm");
  }

  const res = await sb
    .schema("pm")
    .from("workspaces")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false });

  const workspaces: WorkspaceRow[] = res.data ?? [];
  const loadError = res.error?.message ?? null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      <header>
        <h1 className="text-3xl font-semibold">Workspaces</h1>
        <p className="text-[var(--text-secondary)] mt-2 text-sm">
          Jeder Workspace ist ein eigener Tenant. Mitglieder werden pro Workspace
          eingeladen.
        </p>
      </header>

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <h2 className="text-lg font-medium mb-4">Neuen Workspace anlegen</h2>
        <CreateWorkspaceForm />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-4">Deine Workspaces</h2>

        {loadError && (
          <div className="border border-red-500/40 bg-red-500/10 text-red-200 text-sm rounded-md p-3 mb-4">
            Fehler beim Laden: {loadError}
          </div>
        )}

        {workspaces.length === 0 ? (
          <div className="text-[var(--text-secondary)] text-sm border border-dashed border-[var(--border)] rounded-md p-6 text-center">
            Noch keine Workspaces. Lege oben deinen ersten an.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--surface)]">
            {workspaces.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/pm/${w.id}`}
                  className="block px-5 py-4 hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">{w.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      /{w.slug}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
