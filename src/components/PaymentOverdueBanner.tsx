"use client";

import { daysOverdue, useCompany } from "@/lib/company-context";

export function PaymentOverdueBanner() {
  const { company, isReadOnly } = useCompany();
  if (!isReadOnly) return null;

  const isTrialExpired = company.subscription_status === "free_trial";
  const days = daysOverdue(company);

  return (
    <div
      role="alert"
      className="bg-rose-500/10 border-b border-rose-500/30 text-rose-700 dark:text-rose-300"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="m12 2-10 18h20Z" />
          <line x1="12" y1="9" x2="12" y2="14" />
          <line x1="12" y1="18" x2="12" y2="18" />
        </svg>
        {isTrialExpired ? (
          <>
            <span className="font-semibold">
              Testphase beendet — Funktionen eingeschraenkt.
            </span>
            <span className="text-rose-600/80 dark:text-rose-300/80">
              Bitte ein Abo abschliessen, um wieder vollen Zugriff zu erhalten.
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold">
              Rechnung ueberfaellig — Funktionen eingeschraenkt.
            </span>
            <span className="text-rose-600/80 dark:text-rose-300/80">
              Bitte ausstehende Rechnung begleichen{days > 0 ? ` (${days} Tage ueberfaellig)` : ""}.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
