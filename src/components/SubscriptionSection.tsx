"use client";

// SCH-569: subscription management UI — embedded in /settings, admin only.
// SCH-889: active-plan badge + per-card Upgrade/Downgrade/Verwalten copy.
//
// Shows current status (trial countdown / paid / cancelled / overdue),
// a monthly/yearly toggle + three plan cards. Per card the CTA depends on
// whether that card is the company's currently active plan (Verwalten →
// Stripe portal), is more expensive (Upgrade), or is cheaper (Downgrade).
// Cards on the active plan also show an "Aktueller Plan"-Badge and a
// highlighted border so the user can see at a glance where they are.

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/lib/company-context";
import { PLANS, type PlanInterval, type PlanKey } from "@/lib/plans";
import { getActivePlanIndex, getCardCta } from "@/lib/subscription-cta";

function euro(cents: number): string {
  return `€${(cents / 100).toLocaleString("de-AT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function SubscriptionSection() {
  const { company, userRole } = useCompany();
  const [billingInterval, setBillingInterval] = useState<PlanInterval>(
    (company.subscription_interval as PlanInterval | null | undefined) === "year" ? "year" : "month",
  );
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncedRef = useRef(false);

  const status = company.subscription_status ?? "paid";
  const trialDays = daysUntil(company.trial_ends_at ?? null);
  const hasActiveStripeSub = status === "paid" || status === "outstanding";
  const activePlanKey = (company.subscription_plan ?? null) as PlanKey | null;
  const activePlanIdx = getActivePlanIndex(activePlanKey);

  // SCH-889: reconcile the row with Stripe in two cases — (a) the user just
  // returned from a successful checkout (?subscription=success) and the
  // webhook may not have landed yet, and (b) a legacy customer whose row
  // predates SCH-889 (active sub but no subscription_plan column value).
  useEffect(() => {
    if (userRole !== "admin") return;
    if (syncedRef.current) return;

    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const justCheckedOut = params?.get("subscription") === "success";
    const legacyUnsynced = hasActiveStripeSub && !activePlanKey;
    if (!justCheckedOut && !legacyUnsynced) return;

    syncedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/stripe/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyId: company.id }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { plan?: string | null };
        // Reload only if the sync produced a state change OR the user just
        // came back from checkout (which always wants to drop the query
        // param). The plan-key check on the legacy path prevents a reload
        // loop when Stripe also has no record for the customer.
        if (justCheckedOut || (legacyUnsynced && data.plan)) {
          window.location.replace("/settings");
        }
      } catch {
        // network glitch — leave the existing UI as-is, user can retry by
        // refreshing the page.
      }
    })();
  }, [activePlanKey, company.id, hasActiveStripeSub, userRole]);

  if (userRole !== "admin") return null;

  async function handleUpgrade(planKey: PlanKey) {
    setPendingPlan(planKey);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: company.id, planKey, interval: billingInterval }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "checkout_failed");
        return;
      }
      window.location.href = data.url as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "checkout_failed");
    } finally {
      setPendingPlan(null);
    }
  }

  async function handleManage() {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "portal_failed");
        return;
      }
      window.location.href = data.url as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "portal_failed");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Abonnement</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">{subscriptionCopy(status, trialDays)}</p>
        </div>
        {hasActiveStripeSub && (
          <button
            type="button"
            onClick={handleManage}
            disabled={portalLoading}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-[var(--border)] hover:bg-[var(--surface-hover)] transition disabled:opacity-50"
          >
            {portalLoading ? "..." : "Abonnement verwalten"}
          </button>
        )}
      </div>

      <div className="inline-flex rounded-lg overflow-hidden border border-[var(--border)] mb-4">
        <button
          type="button"
          onClick={() => setBillingInterval("month")}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            billingInterval === "month" ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"
          }`}
        >
          Monatlich
        </button>
        <button
          type="button"
          onClick={() => setBillingInterval("year")}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            billingInterval === "year" ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"
          }`}
        >
          Jährlich <span className="text-xs opacity-75">— 25% sparen</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan, idx) => {
          const shown = billingInterval === "month" ? plan.monthlyCents : plan.yearlyAsMonthlyCents;
          const cta = getCardCta(activePlanIdx, idx, hasActiveStripeSub);
          const cardClass = cta.isActive
            ? "rounded-xl border-2 border-[var(--accent)] p-4 flex flex-col relative shadow-[0_0_0_1px_var(--accent)]"
            : "rounded-xl border border-[var(--border)] p-4 flex flex-col relative";
          const buttonClass = cta.isActive
            ? "w-full bg-transparent text-[var(--text-primary)] border border-[var(--accent)] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--surface-hover)] disabled:opacity-50 transition"
            : "w-full bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition";
          const isPending = pendingPlan === plan.key || (cta.action === "manage" && portalLoading);
          const onClick = cta.action === "manage"
            ? handleManage
            : () => handleUpgrade(plan.key as PlanKey);
          return (
            <div key={plan.key} className={cardClass}>
              {cta.isActive && (
                <span className="absolute -top-2 right-3 bg-[var(--accent)] text-black text-xs font-semibold px-2 py-0.5 rounded-full">
                  ✓ Aktueller Plan
                </span>
              )}
              <div className="mb-3">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{plan.name}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{plan.tagline}</p>
              </div>
              <div className="mb-3">
                <span className="text-2xl font-bold text-[var(--text-primary)]">{euro(shown)}</span>
                <span className="text-sm text-[var(--text-muted)]"> / Monat</span>
                {billingInterval === "year" && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {euro(plan.yearlyCents)} jährlich
                  </p>
                )}
              </div>
              <ul className="space-y-1.5 mb-4 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-[var(--text-secondary)] flex gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onClick}
                disabled={pendingPlan !== null || (cta.action === "manage" && portalLoading)}
                className={buttonClass}
              >
                {isPending ? "..." : cta.label}
              </button>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-rose-400 mt-3">{errorCopy(error)}</p>}
    </div>
  );
}

function subscriptionCopy(status: string, trialDays: number | null): string {
  switch (status) {
    case "free_trial":
      if (trialDays === null) return "Kostenlose Testphase.";
      if (trialDays > 1) return `Kostenlose Testphase — noch ${trialDays} Tage.`;
      if (trialDays === 1) return "Kostenlose Testphase — noch 1 Tag.";
      return "Testphase abgelaufen. Bitte wähle einen Plan.";
    case "paid":
      return "Abonnement aktiv.";
    case "outstanding":
      return "Letzte Zahlung fehlgeschlagen. Bitte Zahlungsmethode prüfen.";
    case "overdue":
      return "Zahlung überfällig. Bitte offene Rechnung begleichen.";
    case "cancelled":
      return "Abonnement beendet. Bitte wähle einen Plan, um fortzufahren.";
    default:
      return "";
  }
}

function errorCopy(code: string): string {
  switch (code) {
    case "stripe_not_configured":
      return "Stripe ist noch nicht konfiguriert — bitte wende dich an den Support.";
    case "price_not_configured":
      return "Dieser Plan ist noch nicht verfügbar — bitte später erneut versuchen.";
    case "no_stripe_customer":
      return "Kein Stripe-Kunde für diese Firma gefunden.";
    default:
      return "Etwas ist schiefgelaufen. Bitte erneut versuchen.";
  }
}
