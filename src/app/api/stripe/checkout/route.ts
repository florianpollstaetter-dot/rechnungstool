// SCH-569: Stripe Checkout session creation.
//
// Client calls this with `{ companyId, planKey, interval }`, receives a hosted
// checkout URL, and redirects. On success Stripe sends `checkout.session.completed`
// to /api/stripe/webhook which updates `companies.subscription_status`.
//
// The session is attached to an existing `stripe_customer_id`. If the company
// has none (Stripe was unconfigured at register time, or the create failed),
// we create one here and persist it before starting the session.

import { NextRequest } from "next/server";
import { requireCompanyMembership } from "@/lib/api-auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getPlan, getStripePriceId, type PlanInterval, type PlanKey } from "@/lib/plans";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return Response.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const { companyId, planKey, interval } = body as {
    companyId?: string;
    planKey?: string;
    interval?: string;
  };

  const plan = getPlan(String(planKey ?? ""));
  if (!plan) return Response.json({ error: "unknown_plan" }, { status: 400 });
  if (interval !== "month" && interval !== "year") {
    return Response.json({ error: "invalid_interval" }, { status: 400 });
  }
  const priceId = getStripePriceId(plan.key as PlanKey, interval as PlanInterval);
  if (!priceId) return Response.json({ error: "price_not_configured" }, { status: 503 });

  const auth = await requireCompanyMembership(companyId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { service, user } = auth;

  const { data: company, error: loadErr } = await service
    .from("companies")
    .select("id, name, stripe_customer_id")
    .eq("id", companyId)
    .single();
  if (loadErr || !company) {
    return Response.json({ error: "company_not_found" }, { status: 404 });
  }

  const stripe = getStripe();
  let customerId = company.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: company.name,
      metadata: { company_id: company.id },
    });
    customerId = customer.id;
    await service.from("companies").update({ stripe_customer_id: customerId }).eq("id", company.id);
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // `allow_promotion_codes` lets partner/launch discount codes work without
    // wiring a separate flow for them.
    allow_promotion_codes: true,
    subscription_data: {
      metadata: {
        company_id: company.id,
        plan_key: plan.key,
        interval,
      },
    },
    // Keep Stripe's metadata denormalised on the session too — the
    // `checkout.session.completed` handler reads from here first before
    // falling back to retrieving the subscription object.
    metadata: {
      company_id: company.id,
      plan_key: plan.key,
      interval,
    },
    success_url: `${origin}/settings?subscription=success`,
    cancel_url: `${origin}/settings?subscription=cancelled`,
  });

  return Response.json({ url: session.url });
}
