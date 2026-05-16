"use client";

// ORA-2283 — Payments tab stub. pain.001/008 generation + 4-Augen + HSM-Sign
// is Phase 5; this stub keeps the route alive so navigation never 404s while
// has_treasury=true.

import { useI18n } from "@/lib/i18n-context";

export default function TreasuryPaymentsPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("treasury.payments.title")}</h1>
      <p className="text-sm text-[var(--text-secondary)]">{t("treasury.payments.notAvailable")}</p>
    </div>
  );
}
