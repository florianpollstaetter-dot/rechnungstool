// SCH-825 M1 — Shared workspace-member listing.
//
// The members list joins pm.workspace_members with user_profiles for the
// display_name + email. Used by both the API route handler
// (/api/pm/workspaces/:id/members) and the workspace detail RSC, so they
// can't drift.
//
// The user-scoped SSR client enforces RLS on workspace_members (caller must
// be a member to see anything). Profile lookups go through service-role
// because user_profiles is locked down per-tenant in OO — but only for
// user_ids that already passed the membership filter.

import type { SupabaseClient } from "@supabase/supabase-js";
import { pmServiceClient } from "@/lib/pm/auth";

export type PmMember = {
  workspace_id: string;
  user_id: string;
  role: "admin" | "member" | "guest";
  invited_by: string | null;
  created_at: string;
  display_name: string;
  email: string;
};

export async function listWorkspaceMembers(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<{ members: PmMember[] } | { error: string; status: number }> {
  const membersRes = await sb
    .schema("pm")
    .from("workspace_members")
    .select("workspace_id, user_id, role, invited_by, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (membersRes.error) {
    return { error: membersRes.error.message, status: 500 };
  }

  const rows = (membersRes.data ?? []) as Array<{
    workspace_id: string;
    user_id: string;
    role: "admin" | "member" | "guest";
    invited_by: string | null;
    created_at: string;
  }>;

  if (rows.length === 0) {
    return { members: [] };
  }

  const service = pmServiceClient();
  if (service instanceof Response) {
    return { error: "Service-Konfiguration fehlt", status: 500 };
  }

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const profileRes = await service
    .from("user_profiles")
    .select("auth_user_id, display_name, email")
    .in("auth_user_id", userIds);

  const profiles = new Map<string, { display_name: string; email: string }>();
  (profileRes.data ?? []).forEach(
    (p: { auth_user_id: string; display_name: string | null; email: string | null }) => {
      profiles.set(p.auth_user_id, {
        display_name: p.display_name ?? "",
        email: p.email ?? "",
      });
    },
  );

  const members: PmMember[] = rows.map((r) => {
    const p = profiles.get(r.user_id);
    return {
      workspace_id: r.workspace_id,
      user_id: r.user_id,
      role: r.role,
      invited_by: r.invited_by,
      created_at: r.created_at,
      display_name: p?.display_name ?? "",
      email: p?.email ?? "",
    };
  });

  return { members };
}
