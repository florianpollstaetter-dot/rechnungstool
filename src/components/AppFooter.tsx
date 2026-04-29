"use client";

import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const BUILD_DATE =
  process.env.NEXT_PUBLIC_BUILD_DATE ?? new Date().toISOString().split("T")[0];

const linkClass =
  "text-[var(--text-secondary)] hover:text-[var(--brand-orange)] transition-colors text-sm";

export function AppFooter() {
  const { t } = useI18n();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* SCH-915 K2-A2/A3/A4/B2 — top row: orangeocto lockup left, links right.
            The footer now uses the same orange octopus + Syne wordmark as the
            sidebar/legal header, so the logo no longer changes between routes
            or themes. The Contact email link has been removed (B2). */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 shrink-0"
            title="orangeocto"
            aria-label="orangeocto"
          >
            <Image
              src="/brand/octo-icon-orange.png"
              alt=""
              width={48}
              height={48}
              priority={false}
              className="h-12 w-12"
            />
            <span className="brand-wordmark text-lg sm:text-xl">
              orange<span>octo</span>
            </span>
          </Link>

          {/* Links distributed across remaining width */}
          <nav className="flex flex-wrap items-center justify-center sm:justify-around gap-x-6 gap-y-2 flex-1 text-sm">
            <Link href="/impressum" className={linkClass}>{t("footer.imprint")}</Link>
            <Link href="/agb" className={linkClass}>{t("footer.terms")}</Link>
            <Link href="/datenschutz" className={linkClass}>{t("footer.privacy")}</Link>
            <Link href="/settings" className={linkClass}>{t("footer.settings")}</Link>
          </nav>
        </div>
      </div>

      {/* SCH-915 K2-B1 — divider spans the full viewport width, not just the
          inner max-w-7xl container. Previously the rule sat inside the
          centered column, so on wide screens it stopped short of the edges. */}
      <div className="border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-[var(--text-muted)]">
            <p>&copy; {currentYear} VR the Fans GmbH. {t("footer.allRightsReserved")}</p>
            <p className="font-mono">
              v{VERSION} &middot; Build {BUILD_DATE}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
