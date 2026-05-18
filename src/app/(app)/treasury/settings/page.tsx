"use client";

// ORA-2283 — Treasury settings landing page.
// ORA-2308 — Surfaces the EBICS-Setup-Wizard entry.

import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";

export default function TreasurySettingsPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("treasury.settings.title")}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{t("treasury.settings.notAvailable")}</p>
      </header>

      <Link
        href="/treasury/settings/ebics-setup"
        className="flex flex-col gap-1 border border-[var(--border)] rounded-lg p-5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors"
      >
        <span className="text-sm font-semibold text-[var(--brand-orange)]">
          {t("treasury.settings.ebicsSetup.cta")}
        </span>
        <span className="text-xs text-[var(--text-secondary)]">
          {t("treasury.settings.ebicsSetup.ctaHint")}
        </span>
      </Link>
    </div>
  );
}
