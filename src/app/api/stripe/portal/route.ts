// SCH-569: Stripe Customer Portal redirect.
//
// "Manage subscription" button on the billing page posts here with the active
// companyId; we return a Stripe Portal session URL for self-service cancel,
// payment-method update, and invoice history.

import { NextRequest } from "next/server";
import { requireCompanyMembership } from "@/lib/api-auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return Response.json({ error: "stripe_not_configured" }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const companyId = body?.companyId;
  const auth = await requireCompanyMembership(companyId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { data: company } = await auth.service
    .from("companies")
    .select("stripe_customer_id")
    .eq("id", companyId)
    .single();

  if (!company?.stripe_customer_id) {
    return Response.json({ error: "no_stripe_customer" }, { status: 400 });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const session = await getStripe().billingPortal.sessions.create({
    customer: company.stripe_customer_id,
    return_url: `${origin}/settings`,
  });

  return Response.json({ url: session.url });
}
