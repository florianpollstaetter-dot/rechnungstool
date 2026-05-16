"use client";

// ORA-2283 — Sanctions screening stub. OpenSanctions sync + match-pipeline =
// Phase 6.

import { useI18n } from "@/lib/i18n-context";

export default function TreasurySanctionsPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("treasury.sanctions.title")}</h1>
      <p className="text-sm text-[var(--text-secondary)]">{t("treasury.sanctions.notAvailable")}</p>
    </div>
  );
}
