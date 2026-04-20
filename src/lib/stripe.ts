// SCH-569: server-side Stripe client.
//
// Lazy singleton — the API routes are only evaluated on request, so missing
// env vars surface as a clear 500 from the route rather than a boot-time
// crash for unrelated pages. Webhook signing happens in the webhook route
// with `stripe.webhooks.constructEvent` using this same client.

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  _stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return typeof process.env.STRIPE_SECRET_KEY === "string" && process.env.STRIPE_SECRET_KEY.length > 0;
}
