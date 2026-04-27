// SCH-889: shared parser for the lookup_key format the setup script writes
// to Stripe Prices. Format: `rechnungstool_${plan_key}_${interval}` where
// plan_key ∈ starter|business|pro and interval ∈ month|year. Anything else
// returns null so callers can fall through to a metadata-based fallback.

import type { PlanInterval, PlanKey } from "@/lib/plans";

export interface ParsedLookupKey {
  plan: PlanKey;
  interval: PlanInterval;
}

const VALID_PLANS: ReadonlySet<PlanKey> = new Set(["starter", "business", "pro"]);
const VALID_INTERVALS: ReadonlySet<PlanInterval> = new Set(["month", "year"]);

export function parseStripeLookupKey(key: string | null | undefined): ParsedLookupKey | null {
  if (!key) return null;
  const parts = key.split("_");
  if (parts.length !== 3) return null;
  const [prefix, plan, interval] = parts;
  if (prefix !== "rechnungstool") return null;
  if (!VALID_PLANS.has(plan as PlanKey)) return null;
  if (!VALID_INTERVALS.has(interval as PlanInterval)) return null;
  return { plan: plan as PlanKey, interval: interval as PlanInterval };
}
