// SCH-569: subscription plan catalogue.
//
// Three tiers, each with monthly + annual billing. Euro amounts in *cents*
// because Stripe's unit_amount is an integer minor-unit value. Annual plans
// bill the full year up front at a ~25% discount vs. 12× monthly.
//
// Price IDs are resolved via env vars populated by scripts/setup-stripe-products.ts
// so test/live modes can use their own Stripe prices without a code change.

export type PlanKey = "starter" | "business" | "pro";
export type PlanInterval = "month" | "year";

export interface Plan {
  key: PlanKey;
  name: string;
  tagline: string;
  monthlyCents: number; // shown to the user on the monthly tab
  yearlyCents: number;  // total billed once per year
  yearlyAsMonthlyCents: number; // yearlyCents / 12, displayed as "€X/mo, billed yearly"
  features: string[];
}

export const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    tagline: "Für Einzelunternehmen und kleine Teams.",
    monthlyCents: 1200,
    yearlyCents: 10800,
    yearlyAsMonthlyCents: 900,
    features: [
      "Rechnungen und Angebote unbegrenzt",
      "Bis zu 1 Nutzer",
      "E-Mail-Support",
    ],
  },
  {
    key: "business",
    name: "Business",
    tagline: "Für wachsende Unternehmen mit Team.",
    monthlyCents: 2600,
    yearlyCents: 25200,
    yearlyAsMonthlyCents: 2100,
    features: [
      "Alles aus Starter",
      "Bis zu 5 Nutzer",
      "Erweiterte Dashboard-Auswertungen",
      "Priority-Support",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    tagline: "Für etablierte Unternehmen.",
    monthlyCents: 4400,
    yearlyCents: 43200,
    yearlyAsMonthlyCents: 3600,
    features: [
      "Alles aus Business",
      "Unbegrenzte Nutzer",
      "DATEV-Export",
      "Dedizierter Ansprechpartner",
    ],
  },
];

export function getPlan(key: string): Plan | null {
  return PLANS.find((p) => p.key === key) ?? null;
}

/**
 * Resolve a Stripe price id for a plan+interval combo from env vars. Returns
 * null if the env var is missing so the caller can surface a clear error.
 *
 * Env var shape: `STRIPE_PRICE_{KEY}_{INTERVAL}`, e.g. `STRIPE_PRICE_STARTER_MONTH`.
 * The setup script prints the exact block to paste into .env.local.
 */
export function getStripePriceId(key: PlanKey, interval: PlanInterval): string | null {
  const envKey = `STRIPE_PRICE_${key.toUpperCase()}_${interval.toUpperCase()}`;
  const value = process.env[envKey];
  return value && value.length > 0 ? value : null;
}
