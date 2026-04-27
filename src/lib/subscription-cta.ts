// SCH-889: pure CTA-string + badge resolver for the subscription cards.
//
// Extracted out of SubscriptionSection so we can unit-test the 3×3 plan-rank
// matrix without spinning up React. Plan rank comes from the order of PLANS
// in src/lib/plans.ts (starter = 0, business = 1, pro = 2).

import { PLANS, type PlanKey } from "@/lib/plans";

export type CtaAction = "manage" | "upgrade" | "downgrade" | "subscribe";

export interface CardCta {
  label: string;
  action: CtaAction;
  isActive: boolean;
}

export function getActivePlanIndex(activePlan: PlanKey | null | undefined): number {
  if (!activePlan) return -1;
  return PLANS.findIndex((p) => p.key === activePlan);
}

/**
 * Decide what the CTA on a single plan card should say.
 *
 * - `activePlanIdx === cardIdx` → "Verwalten" (opens Stripe portal)
 * - `cardIdx > activePlanIdx`   → "Upgrade"
 * - `cardIdx < activePlanIdx`   → "Downgrade"
 * - no active plan (trial/free) → "Upgraden" everywhere
 *
 * `hasActiveSub` lets us differentiate a known-active row (subscription_plan
 * is set) from "paid but plan_key not yet synced" (legacy subscriptions
 * before SCH-889; the sync endpoint resolves that on next page load).
 */
export function getCardCta(
  activePlanIdx: number,
  cardIdx: number,
  hasActiveSub: boolean,
): CardCta {
  if (activePlanIdx >= 0 && cardIdx === activePlanIdx) {
    return { label: "Verwalten", action: "manage", isActive: true };
  }
  if (activePlanIdx >= 0 && cardIdx > activePlanIdx) {
    return { label: "Upgrade", action: "upgrade", isActive: false };
  }
  if (activePlanIdx >= 0 && cardIdx < activePlanIdx) {
    return { label: "Downgrade", action: "downgrade", isActive: false };
  }
  // No known active plan. If the company is paid but unsynced, fall back to
  // the pre-SCH-889 copy ("Plan wechseln") so users still have a way out;
  // otherwise it's a fresh trial / free / cancelled customer and every card
  // is a first-time subscribe.
  if (hasActiveSub) {
    return { label: "Plan wechseln", action: "upgrade", isActive: false };
  }
  return { label: "Upgraden", action: "subscribe", isActive: false };
}
