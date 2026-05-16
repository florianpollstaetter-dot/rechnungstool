"use client";

// ORA-2283 — Treasury sub-navigation tabs. Same visual pattern as
// AngeboteTabBar/TabButton elsewhere in the app: small horizontal pill row.
//
// The Treasury sidebar block already lists each sub-route, so this tab bar is
// a redundant convenience pointer inside the right-hand content area —
// matches how /time uses its own view-tabs while the sidebar lists the same
// destinations.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n-context";
import type { TranslationKey } from "@/lib/translations/de";

interface Tab {
  href: string;
  labelKey: TranslationKey;
  exact?: boolean;
}

const TABS: Tab[] = [
  { href: "/treasury", labelKey: "nav.treasury", exact: true },
  { href: "/treasury/cash", labelKey: "nav.treasuryCash" },
  { href: "/treasury/accounts", labelKey: "nav.treasuryAccounts" },
  { href: "/treasury/forecast", labelKey: "nav.treasuryForecast" },
  { href: "/treasury/payments", labelKey: "nav.treasuryPayments" },
  { href: "/treasury/sanctions", labelKey: "nav.treasurySanctions" },
  { href: "/treasury/reports", labelKey: "nav.treasuryReports" },
  { href: "/treasury/settings", labelKey: "nav.treasurySettings" },
];

export default function TreasuryTabBar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav
      aria-label="Treasury-Navigation"
      className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-2"
    >
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--brand-orange-dim)] text-[var(--brand-orange)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
