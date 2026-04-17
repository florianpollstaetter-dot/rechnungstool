import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

/**
 * Creates a Supabase client with service_role key to bypass RLS.
 * Only for use in operator API routes.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
}

/**
 * Verifies the caller is a superadmin. Returns the user or throws.
 */
export async function requireSuperadmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Nicht authentifiziert", status: 401, user: null };
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("is_superadmin")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile?.is_superadmin) {
    return { error: "Kein Superadmin-Zugriff", status: 403, user: null };
  }

  return { error: null, status: 200, user };
}

/**
 * Log an operator action to the audit log.
 */
export async function logOperatorAction(
  operatorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown>
) {
  const service = createServiceClient();
  await service.from("operator_audit_log").insert({
    operator_id: operatorId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details || null,
  });
}
