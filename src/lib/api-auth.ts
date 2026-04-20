import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";

export type CompanyMembershipAuth =
  | { ok: false; error: string; status: number }
  | { ok: true; user: User; service: SupabaseClient };

/**
 * Verify the caller is authenticated AND a member of `companyId` via
 * `company_members`. Use this on service-role API routes that mutate or
 * read tenant-scoped data by id (bypassing RLS). The caller-supplied
 * `companyId` is not trusted — it is validated against the session user's
 * actual memberships.
 */
export async function requireCompanyMembership(
  companyId: unknown,
): Promise<CompanyMembershipAuth> {
  if (typeof companyId !== "string" || companyId.trim() === "") {
    return { ok: false, error: "companyId required", status: 400 };
  }

  const ssr = await createServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) {
    return { ok: false, error: "Nicht authentifiziert", status: 401 };
  }

  const service = createServiceClient();
  const { data: membership } = await service
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!membership) {
    return { ok: false, error: "Kein Zugriff auf diese Firma", status: 403 };
  }

  return { ok: true, user, service };
}
