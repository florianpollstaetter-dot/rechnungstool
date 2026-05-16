"use client";

// ORA-2283 — Treasury settings stub. EBICS-Partner-Config + HSM-Key-Setup =
// Phase 3.

import { useI18n } from "@/lib/i18n-context";

export default function TreasurySettingsPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("treasury.settings.title")}</h1>
      <p className="text-sm text-[var(--text-secondary)]">{t("treasury.settings.notAvailable")}</p>
    </div>
  );
}
