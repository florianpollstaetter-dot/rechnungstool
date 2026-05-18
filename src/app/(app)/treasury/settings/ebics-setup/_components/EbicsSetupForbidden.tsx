"use client";

import { useI18n } from "@/lib/i18n-context";

export default function EbicsSetupForbidden() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3 max-w-xl">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        {t("treasury.settings.ebicsSetup.title")}
      </h1>
      <div
        role="alert"
        className="rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
      >
        {t("treasury.settings.ebicsSetup.forbidden")}
      </div>
    </div>
  );
}
