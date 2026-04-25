"use client";

// SCH-819 Phase-2 — top-tab strip shared by /quotes, /customers, /products.
// Florian's spec: "Subseiten Produkte + Kunden in Top-Leiste innerhalb
// 'Angebote' integrieren (analog Zeiterfassung)".

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n-context";
import type { TranslationKey } from "@/lib/translations/de";

const TABS: { href: string; labelKey: TranslationKey }[] = [
  { href: "/quotes", labelKey: "nav.quotes" },
  { href: "/customers", labelKey: "nav.customers" },
  { href: "/products", labelKey: "nav.products" },
];

export default function AngeboteTabBar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <div
      className="mb-6 -mt-2 flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-0.5 w-fit"
      role="tablist"
      aria-label={t("nav.quotes")}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={[
              "relative px-3.5 py-2 text-xs font-medium rounded-md",
              "transition-all duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]/50",
              active
                ? "text-[var(--brand-orange)] bg-[var(--brand-orange-dim)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]",
            ].join(" ")}
          >
            {t(tab.labelKey)}
            <span
              className={[
                "absolute -bottom-px left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-[var(--brand-orange)]",
                "transition-all duration-150 ease-out",
                active ? "w-4/5 opacity-100" : "w-0 opacity-0",
              ].join(" ")}
            />
          </Link>
        );
      })}
    </div>
  );
}
