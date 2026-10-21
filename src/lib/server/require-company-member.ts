// ORA-3310 — shared session+membership guard for service-role API routes.
//
// Several API routes run with the service-role key (which bypasses RLS) and
// read `companyId` straight from the request. Before this guard they trusted
// the caller completely: anyone could pass an arbitrary companyId and read or
// write that company's data without a login. This helper closes that hole.
//
//   - No Supabase session            → 401 (not authenticated)
//   - Session, but not a member of
//     the requested company          → 403 (wrong company)
//
// The membership lookup itself uses the service-role client so it works
// regardless of RLS state on `company_members`, but the *identity* always
// comes from the verified session cookie (anon-key SSR client), never from
// the request body.

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";
import { decideCompanyMembership } from "@/lib/auth/api-access-policy";

export type CompanyMemberAuth =
  | { ok: false; status: 401 | 403; error: string }
  | { ok: true; userId: string };

/**
 * Verify the current session belongs to `companyId`.
 * Returns `{ ok: true }` with the authenticated user id, or an `{ ok: false }`
 * result carrying the HTTP status the route should return. The actual
 * allow/deny rule lives in the pure `decideCompanyMembership` helper.
 */
export async function requireCompanyMember(companyId: string): Promise<CompanyMemberAuth> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Resolve the caller's membership in this company (null session → no member
  // ids), then apply the shared pure policy.
  let memberCompanyIds: string[] = [];
  if (user) {
    const service = createServiceClient();
    const { data } = await service
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (data) memberCompanyIds = [companyId];
  }

  const decision = decideCompanyMembership(Boolean(user), memberCompanyIds, companyId);
  if (!decision.ok) {
    return { ok: false, status: decision.status, error: decision.error };
  }
  return { ok: true, userId: user!.id };
}

/**
 * Convenience wrapper: returns a ready-to-return `Response` when the caller is
 * not allowed, or `null` when the caller may proceed. Mirrors `readOnlyGuard`.
 */
export async function companyMemberGuard(companyId: string): Promise<Response | null> {
  const auth = await requireCompanyMember(companyId);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  return null;
}
