import type { User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";

export type CompanyAdminAuth =
  | { error: string; status: number; user: null; adminCompanyIds: string[] }
  | { error: null; status: 200; user: User; adminCompanyIds: string[] };

/**
 * Verify the caller is a tenant admin — i.e. `user_profiles.role = 'admin'`.
 * The returned `adminCompanyIds` is the set of company ids the caller belongs
 * to via `company_members`; the API must enforce that the target employee is
 * a member of one of these before any mutation.
 */
export async function requireCompanyAdmin(): Promise<CompanyAdminAuth> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Nicht authentifiziert", status: 401, user: null, adminCompanyIds: [] };
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return { error: "Kein Admin-Zugriff", status: 403, user: null, adminCompanyIds: [] };
  }

  const { data: memberships } = await service
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id);

  const adminCompanyIds = (memberships ?? []).map((m) => m.company_id as string);

  return { error: null, status: 200, user, adminCompanyIds };
}

export async function logCompanyAuditAction(
  actorUserId: string,
  companyId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown>,
) {
  const service = createServiceClient();
  await service.from("company_audit_log").insert({
    actor_user_id: actorUserId,
    company_id: companyId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details || null,
  });
}

// Readable temp password: 4 blocks of 4 lowercase + digit chars separated by '-'.
// Avoids look-alike characters (0/O, 1/l/I) so it can be read aloud or typed.
export function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}`;
}
