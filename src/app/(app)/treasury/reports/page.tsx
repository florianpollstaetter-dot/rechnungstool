"use client";

// ORA-2283 — Reports stub. Board-Pack-PDF + WP-Audit-Export = Phase 7.

import { useI18n } from "@/lib/i18n-context";

export default function TreasuryReportsPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("treasury.reports.title")}</h1>
      <p className="text-sm text-[var(--text-secondary)]">{t("treasury.reports.notAvailable")}</p>
    </div>
  );
}
