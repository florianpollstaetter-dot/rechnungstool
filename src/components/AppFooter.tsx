import Image from "next/image";
import Link from "next/link";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const BUILD_DATE =
  process.env.NEXT_PUBLIC_BUILD_DATE ?? new Date().toISOString().split("T")[0];

const linkClass =
  "text-[var(--text-secondary)] hover:text-[var(--brand-orange)] transition-colors text-sm";

export function AppFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {/* Top row: logo left, links spread across the rest */}
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="flex flex-col items-center sm:items-start shrink-0">
            <Image
              src="/brand/octo-logo-full-white.png"
              alt="Orange Octo — easy accounting"
              width={260}
              height={90}
              priority={false}
              className="h-auto w-auto max-h-20 brand-logo-dark"
            />
            <Image
              src="/brand/octo-logo-full-black.png"
              alt="Orange Octo — easy accounting"
              width={260}
              height={90}
              priority={false}
              className="h-auto w-auto max-h-20 brand-logo-light"
            />
          </div>

          {/* Links distributed across remaining width */}
          <nav className="flex flex-wrap items-center justify-center sm:justify-end gap-x-6 gap-y-2 flex-1 text-sm">
            <Link href="/impressum" className={linkClass}>Impressum</Link>
            <Link href="/agb" className={linkClass}>AGB</Link>
            <Link href="/datenschutz" className={linkClass}>Datenschutz</Link>
            <Link href="/settings" className={linkClass}>Einstellungen</Link>
            <a href="mailto:office@vrthefans.com" className={linkClass}>Kontakt</a>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[var(--border)] mt-4 pt-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-[var(--text-muted)]">
            <p>&copy; {currentYear} VR the Fans GmbH. Alle Rechte vorbehalten.</p>
            <p className="font-mono">
              v{VERSION} &middot; Build {BUILD_DATE}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
