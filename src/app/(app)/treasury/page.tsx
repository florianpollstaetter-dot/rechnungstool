"use client";

// ORA-2283 — Treasury overview page.
//
// Phase 0+1 scope: KPI tiles for the Cash position (total balance, account
// count, latest statement) sourced from the read-only CAMT.053 import. Deeper
// views live in the subroutes.

import { useI18n } from "@/lib/i18n-context";
import CashKpiTiles from "@/components/treasury/CashKpiTiles";

export default function TreasuryOverviewPage() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("treasury.title")}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{t("treasury.subtitle")}</p>
      </header>
      <CashKpiTiles />
    </div>
  );
}
