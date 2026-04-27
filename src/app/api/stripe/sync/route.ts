// SCH-889: reconcile a company's row with Stripe's view of its subscription.
//
// The webhook (route.ts) keeps things in sync going forward, but two cases
// need a pull-based fallback:
//  1. Companies that bought before SCH-889 shipped — their subscription_plan
//     column is still NULL even though Stripe knows the plan.
//  2. The user just returned from Stripe Checkout (?subscription=success)
//     and the customer.subscription.created webhook hasn't landed yet.
//
// SubscriptionSection calls this on mount when either condition is true.
// Idempotent: writing the same plan/interval back is a no-op.

import { NextRequest } from "next/server";
import { requireCompanyMembership } from "@/lib/api-auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { parseStripeLookupKey } from "@/lib/stripe-lookup-key";
import type { PlanInterval, PlanKey } from "@/lib/plans";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return Response.json({ error: "stripe_not_configured" }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const companyId = body?.companyId;
  const auth = await requireCompanyMembership(companyId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { service } = auth;
  const { data: company } = await service
    .from("companies")
    .select("id, stripe_customer_id, stripe_subscription_id")
    .eq("id", companyId)
    .single();

  if (!company) return Response.json({ error: "company_not_found" }, { status: 404 });

  const stripe = getStripe();
  let subscriptionId = company.stripe_subscription_id as string | null;

  // No saved subscription id — happens for users who created the customer
  // before subscribing or where the original webhook missed. Fall back to
  // listing subscriptions for the customer.
  if (!subscriptionId && company.stripe_customer_id) {
    const list = await stripe.subscriptions.list({
      customer: company.stripe_customer_id,
      status: "all",
      limit: 1,
    });
    subscriptionId = list.data[0]?.id ?? null;
  }

  if (!subscriptionId) {
    return Response.json({ ok: true, plan: null, interval: null });
  }

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const firstItem = sub.items.data[0];
  const lookupKey = firstItem?.price?.lookup_key ?? null;
  const fromLookup = parseStripeLookupKey(lookupKey);
  const metaPlan = sub.metadata?.plan_key ?? null;
  const metaInterval = sub.metadata?.interval ?? null;
  const plan: PlanKey | null = fromLookup?.plan
    ?? (metaPlan === "starter" || metaPlan === "business" || metaPlan === "pro" ? metaPlan : null);
  const interval: PlanInterval | null = fromLookup?.interval
    ?? (metaInterval === "month" || metaInterval === "year" ? metaInterval : null);

  if (sub.status === "canceled") {
    await service
      .from("companies")
      .update({
        subscription_status: "cancelled",
        subscription_plan: null,
        subscription_interval: null,
      })
      .eq("id", companyId);
    return Response.json({ ok: true, plan: null, interval: null, status: "cancelled" });
  }

  const update: Record<string, unknown> = { stripe_subscription_id: sub.id };
  if (plan) update.subscription_plan = plan;
  if (interval) update.subscription_interval = interval;
  if (sub.status === "active" || sub.status === "trialing") update.subscription_status = "paid";

  await service.from("companies").update(update).eq("id", companyId);

  return Response.json({ ok: true, plan, interval, status: sub.status });
}
