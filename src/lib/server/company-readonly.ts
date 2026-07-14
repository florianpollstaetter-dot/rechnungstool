import { createClient } from "@supabase/supabase-js";

const READ_ONLY_MESSAGE =
  "Rechnung ueberfaellig — Funktionen eingeschraenkt. Bitte ausstehende Rechnung begleichen.";

/**
 * Returns true when the company is past the 60-day overdue threshold.
 * Mirrors the `public.is_company_read_only` SQL function so that read-only
 * server routes (e.g. DATEV CSV export) can refuse before doing work that
 * the DB-level trigger does not cover (it only fires on writes).
 */
export async function isCompanyReadOnly(companyId: string): Promise<boolean> {
  if (!companyId) return false;
  // ORA-2809 H0: global billing switch. While Stripe is sandbox (default) the
  // gate is fully disabled so no tenant is ever locked. Mirrors the DB-side
  // public.billing_enabled() default of FALSE.
  if (process.env.BILLING_ENABLED !== "true") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const sb = createClient(url, key);
  const { data } = await sb
    .from("companies")
    .select("subscription_status, is_free, is_internal, next_payment_due_at")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return false;
  if (data.is_free || data.is_internal) return false;
  // Cancelled Stripe subscription → immediate read-only, no grace.
  if (data.subscription_status === "cancelled") return true;
  // Otherwise only a real >60d-overdue subscription (trial expiry never counts).
  if (data.subscription_status !== "overdue") return false;
  if (!data.next_payment_due_at) return false;
  const due = new Date(data.next_payment_due_at).getTime();
  if (Number.isNaN(due)) return false;
  const ageDays = (Date.now() - due) / (1000 * 60 * 60 * 24);
  return ageDays > 60;
}

/**
 * If the company is read-only, returns a 403 Response that route handlers
 * should return immediately. Otherwise returns null and the caller continues.
 */
export async function readOnlyGuard(companyId: string): Promise<Response | null> {
  if (await isCompanyReadOnly(companyId)) {
    return Response.json({ error: READ_ONLY_MESSAGE }, { status: 403 });
  }
  return null;
}
