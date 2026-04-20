#!/usr/bin/env -S npx tsx
/**
 * SCH-569: one-shot Stripe product + price bootstrap.
 *
 * Idempotent — every product is looked up by a stable `metadata.plan_key`
 * tag, every price by a Stripe `lookup_key`. Re-running after a successful
 * run prints the same price ids without creating duplicates.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_xxx npx tsx scripts/setup-stripe-products.ts
 *
 * Output: a block of `STRIPE_PRICE_*` env vars to append to .env.local
 * (and paste into Vercel → Project → Settings → Environment Variables).
 */

import Stripe from "stripe";
import { PLANS, type Plan } from "../src/lib/plans";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is required.");
    process.exit(1);
  }
  const stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  const envLines: string[] = [];

  for (const plan of PLANS) {
    const product = await upsertProduct(stripe, plan);
    console.log(`✓ product ${plan.key} → ${product.id}`);

    const monthly = await upsertPrice(stripe, product.id, plan, "month");
    console.log(`  ✓ price ${plan.key} month → ${monthly.id} (€${plan.monthlyCents / 100}/mo)`);
    envLines.push(`STRIPE_PRICE_${plan.key.toUpperCase()}_MONTH=${monthly.id}`);

    const yearly = await upsertPrice(stripe, product.id, plan, "year");
    console.log(`  ✓ price ${plan.key} year  → ${yearly.id} (€${plan.yearlyCents / 100}/yr)`);
    envLines.push(`STRIPE_PRICE_${plan.key.toUpperCase()}_YEAR=${yearly.id}`);
  }

  console.log("\n--- paste into .env.local (and Vercel env) ---\n");
  console.log(envLines.join("\n"));
}

async function upsertProduct(stripe: Stripe, plan: Plan): Promise<Stripe.Product> {
  const list = await stripe.products.search({
    query: `active:'true' AND metadata['plan_key']:'${plan.key}'`,
    limit: 1,
  });
  if (list.data.length > 0) {
    const existing = list.data[0];
    if (existing.name !== plan.name || existing.description !== plan.tagline) {
      return stripe.products.update(existing.id, {
        name: plan.name,
        description: plan.tagline,
      });
    }
    return existing;
  }
  return stripe.products.create({
    name: plan.name,
    description: plan.tagline,
    metadata: { plan_key: plan.key },
  });
}

async function upsertPrice(
  stripe: Stripe,
  productId: string,
  plan: Plan,
  interval: "month" | "year",
): Promise<Stripe.Price> {
  const lookupKey = `rechnungstool_${plan.key}_${interval}`;
  const amount = interval === "month" ? plan.monthlyCents : plan.yearlyCents;

  const list = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (list.data.length > 0) {
    const existing = list.data[0];
    if (existing.unit_amount === amount && existing.currency === "eur") {
      return existing;
    }
    // Amount changed — Stripe prices are immutable, so archive the old one
    // (it stays attached to existing subscriptions) and create a new price
    // under the same lookup_key. `transfer_lookup_key: true` moves the key
    // from the archived price to the new one atomically.
    await stripe.prices.update(existing.id, { active: false });
  }

  return stripe.prices.create({
    product: productId,
    currency: "eur",
    unit_amount: amount,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: { plan_key: plan.key, interval },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
