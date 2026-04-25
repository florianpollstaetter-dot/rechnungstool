"use client";

// SCH-819 Phase 4 — first-quote setup gate.
//
// Florian's bug quote: "Bei erstmaligem Erstellen sind VR-the-Fans-Inhalte
// als Default sichtbar — sollte stattdessen Setup-Assistent zeigen (Logo,
// Beschreibungen, von KI vorausgefüllt)".
//
// Root cause: `getActiveCompanyId()` falls back to "vrthefans" so a fresh
// account lands on the seed company whose `company_name` is the literal
// "VR the Fans GmbH". The /quotes/new form then shows that as the issuer
// of the first invoice. We detect that state (or any unconfigured company)
// and route the user to the AI-Unternehmens-Setup in /settings before they
// commit a quote with placeholder data.
//
// "Trotzdem fortfahren" stays opt-in via a per-company localStorage flag so
// the gate doesn't keep nagging users who deliberately want VR-Fans data
// (CEO/board demos).

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { CompanySettings } from "@/lib/types";
import { useI18n } from "@/lib/i18n-context";

const SEED_COMPANY_NAME = "VR the Fans GmbH";
const DISMISS_KEY_PREFIX = "oo:quote-new-setup-gate-dismissed:";

export function isCompanyUnconfigured(settings: CompanySettings | null | undefined): boolean {
  if (!settings) return false;
  const name = (settings.company_name ?? "").trim();
  if (!name) return true;
  if (name === SEED_COMPANY_NAME) return true;
  return false;
}

export interface QuoteNewSetupGateProps {
  settings: CompanySettings | null;
  companyId: string | null;
  children: ReactNode;
}

const _noopSubscribe = () => () => {};

function useDismissedFromStorage(companyId: string | null): boolean {
  return useSyncExternalStore(
    _noopSubscribe,
    () => {
      if (typeof window === "undefined" || !companyId) return false;
      return window.localStorage.getItem(`${DISMISS_KEY_PREFIX}${companyId}`) === "1";
    },
    () => false,
  );
}

export default function QuoteNewSetupGate({ settings, companyId, children }: QuoteNewSetupGateProps) {
  const { t } = useI18n();
  const persistedDismissed = useDismissedFromStorage(companyId);
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const dismissed = persistedDismissed || sessionDismissed;

  // Settings still loading — let the parent's own loading UI run.
  if (settings === null) return <>{children}</>;
  if (!isCompanyUnconfigured(settings) || dismissed) return <>{children}</>;

  function handleProceed() {
    if (typeof window !== "undefined" && companyId) {
      window.localStorage.setItem(`${DISMISS_KEY_PREFIX}${companyId}`, "1");
    }
    setSessionDismissed(true);
  }

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-8 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        {t("quoteNew.setupGate.title")}
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
        {t("quoteNew.setupGate.body")}
      </p>
      <ul className="text-sm text-[var(--text-secondary)] mb-6 list-disc list-inside space-y-1">
        <li>{t("quoteNew.setupGate.bullet1")}</li>
        <li>{t("quoteNew.setupGate.bullet2")}</li>
        <li>{t("quoteNew.setupGate.bullet3")}</li>
      </ul>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/settings#ai-setup"
          className="bg-[var(--accent)] text-black px-5 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition text-center"
        >
          {t("quoteNew.setupGate.openWizard")}
        </Link>
        <button
          type="button"
          onClick={handleProceed}
          className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-5 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
        >
          {t("quoteNew.setupGate.proceed")}
        </button>
      </div>
    </div>
  );
}
