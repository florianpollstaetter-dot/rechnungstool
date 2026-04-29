// SCH-918 (K2-γ): Server-only permission guard. Splits server imports out of
// the client-safe `lib/permissions.ts`.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";
import {
  getMembership,
  hasMemberPermission,
  type MemberPermissionKey,
  type MembershipWithPermissions,
} from "./permissions";

export type RequirePermissionResult =
  | { ok: false; error: string; status: number }
  | { ok: true; user: User; service: SupabaseClient; membership: MembershipWithPermissions };

// API helper: 401 if unauthenticated, 403 if not a member or missing the
// permission. The `companyId` is the tenant the API call targets.
export async function requireMemberPermission(
  companyId: unknown,
  key: MemberPermissionKey,
): Promise<RequirePermissionResult> {
  if (typeof companyId !== "string" || companyId.trim() === "") {
    return { ok: false, error: "companyId required", status: 400 };
  }
  const ssr = await createServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { ok: false, error: "Nicht authentifiziert", status: 401 };

  const service = createServiceClient();
  const membership = await getMembership(service, user.id, companyId);
  if (!membership) {
    return { ok: false, error: "Kein Zugriff auf diese Firma", status: 403 };
  }
  if (!hasMemberPermission(membership, key)) {
    return { ok: false, error: "Fehlende Berechtigung", status: 403 };
  }
  return { ok: true, user, service, membership };
}
