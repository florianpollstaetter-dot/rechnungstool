// ORA-2283 — Treasury feature-flag helpers.
//
// Server-side: `companyHasTreasury(companyId)` reads `company_subscriptions.has_treasury`
// via service role and is the source of truth for the middleware gate and any
// API route that should 404 when the feature is off.
//
// Client-side: <TreasuryFeatureGate /> wraps client components and renders
// nothing when has_treasury is false. The sidebar Treasury block uses the
// same flag via `useCompanySubscription()`.

import { createServiceClient } from "@/lib/operator";
import type { CompanySubscription } from "./types";

/**
 * Server-side check. Uses service-role so it works from middleware/route
 * handlers without depending on the JWT claim. Returns `false` for unknown
 * companies (safe default).
 */
export async function companyHasTreasury(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId) return false;
  const service = createServiceClient();
  const { data, error } = await service
    .from("company_subscriptions")
    .select("has_treasury")
    .eq("company_id", companyId)
    .maybeSingle<{ has_treasury: boolean }>();
  if (error || !data) return false;
  return data.has_treasury === true;
}

/**
 * Load the full subscription row. Used by the Treasury sidebar block + the
 * `/treasury` overview page. Returns `null` if no row exists.
 */
export async function getCompanySubscription(
  companyId: string | null | undefined,
): Promise<CompanySubscription | null> {
  if (!companyId) return null;
  const service = createServiceClient();
  const { data, error } = await service
    .from("company_subscriptions")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle<CompanySubscription>();
  if (error || !data) return null;
  return data;
}
