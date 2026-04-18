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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const sb = createClient(url, key);
  const { data } = await sb
    .from("companies")
    .select("subscription_status, is_free, next_payment_due_at")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return false;
  if (data.is_free) return false;
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
