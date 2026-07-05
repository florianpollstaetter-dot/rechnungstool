// SCH-825 M1 — PM-API Session-Gate.
//
// Every /api/pm/* route is a tenant-isolated PM endpoint. We require an
// authenticated Supabase session (shared with Orange-Octo via Supabase Auth)
// and hand back the SSR client so the caller's RLS context (`pm.is_workspace_member`
// helpers etc.) applies to every query made through it. Routes never use the
// service-role key for tenant data — RLS is the only auth guarantee.

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PmSession = {
  user: { id: string; email?: string };
  sb: SupabaseClient;
};

export async function requirePmSession(): Promise<PmSession | Response> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return Response.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }
  return { user: { id: user.id, email: user.email }, sb };
}

// Service-role client for the few admin lookups that legitimately need to
// bypass RLS (e.g. invite-by-email needs to look up auth.users). Caller is
// responsible for never returning unfiltered data to the client.
import { createClient as createSbClient } from "@supabase/supabase-js";

export function pmServiceClient(): SupabaseClient | Response {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    return Response.json(
      { error: "Server-Konfiguration fehlt (SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }
  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
