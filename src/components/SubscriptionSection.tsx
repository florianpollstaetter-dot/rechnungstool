"use client";

// SCH-569: subscription management UI — embedded in /settings, admin only.
//
// Shows current status (trial countdown / paid / cancelled / overdue),
// a monthly/yearly toggle + three plan cards, and two actions:
//   - "Upgrade" per plan → POST /api/stripe/checkout → redirect
//   - "Manage subscription" → POST /api/stripe/portal → redirect
//
// Plan features/prices come from PLANS so this stays single-source with the
// Stripe setup script.

import { useState } from "react";
import { useCompany } from "@/lib/company-context";
import { PLANS, type PlanInterval, type PlanKey } from "@/lib/plans";

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
  const [interval, setInterval] = useState<PlanInterval>("month");
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (userRole !== "admin") return null;

  const status = company.subscription_status ?? "paid";
  const trialDays = daysUntil(company.trial_ends_at ?? null);
  const hasActiveStripeSub = status === "paid" || status === "outstanding";

  async function handleUpgrade(planKey: PlanKey) {
    setPendingPlan(planKey);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: company.id, planKey, interval }),
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
          onClick={() => setInterval("month")}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            interval === "month" ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"
          }`}
        >
          Monatlich
        </button>
        <button
          type="button"
          onClick={() => setInterval("year")}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            interval === "year" ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"
          }`}
        >
          Jährlich <span className="text-xs opacity-75">— 25% sparen</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const shown = interval === "month" ? plan.monthlyCents : plan.yearlyAsMonthlyCents;
          return (
            <div
              key={plan.key}
              className="rounded-xl border border-[var(--border)] p-4 flex flex-col"
            >
              <div className="mb-3">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{plan.name}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{plan.tagline}</p>
              </div>
              <div className="mb-3">
                <span className="text-2xl font-bold text-[var(--text-primary)]">{euro(shown)}</span>
                <span className="text-sm text-[var(--text-muted)]"> / Monat</span>
                {interval === "year" && (
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
                onClick={() => handleUpgrade(plan.key as PlanKey)}
                disabled={pendingPlan !== null}
                className="w-full bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition"
              >
                {pendingPlan === plan.key ? "..." : hasActiveStripeSub ? "Plan wechseln" : "Upgraden"}
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
