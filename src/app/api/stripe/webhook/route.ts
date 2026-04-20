// SCH-569: Stripe webhook endpoint.
//
// Events → DB sync:
//   checkout.session.completed        — first successful checkout, attach subscription id
//   customer.subscription.updated     — plan change, renewal, status flip
//   customer.subscription.deleted     — fully cancelled → subscription_status='cancelled'
//   invoice.payment_succeeded         — mark 'paid', bump last_payment_at + next_payment_due_at
//   invoice.payment_failed            — flip to 'outstanding' (SCH-481 grace kicks in after 60d)
//
// Signature verification uses STRIPE_WEBHOOK_SECRET (provided by the board
// after they add the endpoint in the Stripe dashboard). Without it the route
// refuses to process events — unsigned requests could forge status changes.
//
// Raw body: Next.js App Router gives us req.text() which is what Stripe needs
// for signature verification. Do NOT use req.json() here.

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs"; // stripe sdk + crypto need node, not edge

type CompanyRow = {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return Response.json({ error: "missing_signature" }, { status: 400 });

  const raw = await req.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("stripe webhook: signature verification failed", err);
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(stripe, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.created":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // Event is acknowledged with 200 so Stripe stops retrying. Every
        // unknown type is benign — we only subscribe to the handful above.
        break;
    }
  } catch (err) {
    console.error(`stripe webhook: handler failed for ${event.type}`, err);
    return Response.json({ error: "handler_failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}

async function handleCheckoutCompleted(stripe: Stripe, session: Stripe.Checkout.Session) {
  const companyId = session.metadata?.company_id;
  if (!companyId) {
    console.warn("checkout.session.completed without company_id metadata", session.id);
    return;
  }
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;
  if (!subscriptionId) return;

  // Pull the full subscription to get status + period end rather than trusting
  // the checkout session's narrower view.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(companyId, sub);
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const companyId = await resolveCompanyIdFromSubscription(sub);
  if (!companyId) return;
  await syncSubscription(companyId, sub);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const companyId = await resolveCompanyIdFromSubscription(sub);
  if (!companyId) return;
  await service()
    .from("companies")
    .update({
      subscription_status: "cancelled",
      stripe_subscription_id: sub.id,
    })
    .eq("id", companyId);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const companyId = await resolveCompanyIdFromInvoice(invoice);
  if (!companyId) return;
  const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;
  const periodEnd = invoice.lines.data[0]?.period?.end ?? null;
  await service()
    .from("companies")
    .update({
      subscription_status: "paid",
      last_payment_at: paidAt ? new Date(paidAt * 1000).toISOString() : new Date().toISOString(),
      next_payment_due_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq("id", companyId);
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const companyId = await resolveCompanyIdFromInvoice(invoice);
  if (!companyId) return;
  // SCH-481: 'outstanding' is the not-yet-read-only dunning state. The
  // company goes read-only automatically 60 days past next_payment_due_at.
  await service()
    .from("companies")
    .update({ subscription_status: "outstanding" })
    .eq("id", companyId);
}

async function syncSubscription(companyId: string, sub: Stripe.Subscription) {
  const firstItem = sub.items.data[0];
  const periodEnd = firstItem?.current_period_end ?? null;
  const nextStatus = mapStripeStatus(sub.status);
  const update: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
  };
  if (nextStatus) update.subscription_status = nextStatus;
  if (periodEnd) update.next_payment_due_at = new Date(periodEnd * 1000).toISOString();

  await service().from("companies").update(update).eq("id", companyId);
}

/**
 * Stripe subscription.status values:
 *   active | past_due | unpaid | canceled | incomplete | incomplete_expired |
 *   trialing | paused
 *
 * Mapped to the app's internal subscription_status:
 *   active, trialing → paid   (trialing here means Stripe-side trial, rare
 *                              because our free trial is app-side; if the
 *                              board ever enables trial on a price it still
 *                              works — full app access.)
 *   past_due         → outstanding
 *   unpaid           → overdue
 *   canceled         → cancelled
 *   incomplete*      → undefined (leave as-is; user still needs to finish
 *                                 checkout)
 *   paused           → outstanding (treat like dunning)
 */
function mapStripeStatus(s: Stripe.Subscription.Status): string | null {
  switch (s) {
    case "active":
    case "trialing":
      return "paid";
    case "past_due":
    case "paused":
      return "outstanding";
    case "unpaid":
      return "overdue";
    case "canceled":
      return "cancelled";
    default:
      return null;
  }
}

async function resolveCompanyIdFromSubscription(sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.company_id) return sub.metadata.company_id;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  return resolveCompanyIdFromCustomer(customerId);
}

async function resolveCompanyIdFromInvoice(invoice: Stripe.Invoice): Promise<string | null> {
  if (invoice.metadata?.company_id) return invoice.metadata.company_id;
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id ?? null;
  if (!customerId) return null;
  return resolveCompanyIdFromCustomer(customerId);
}

async function resolveCompanyIdFromCustomer(customerId: string): Promise<string | null> {
  const { data } = await service()
    .from("companies")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle<CompanyRow>();
  return data?.id ?? null;
}
