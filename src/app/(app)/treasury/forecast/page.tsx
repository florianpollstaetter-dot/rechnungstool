"use client";

// ORA-2283 — Forecast tab stub. Real 13-week ML forecast + driver-editor is
// Phase 4 (ML side-service ticket spawns separately).

import { useI18n } from "@/lib/i18n-context";

export default function TreasuryForecastPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("treasury.forecast.title")}</h1>
      <p className="text-sm text-[var(--text-secondary)]">{t("treasury.forecast.notAvailable")}</p>
    </div>
  );
}
