import Image from "next/image";
import Link from "next/link";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const BUILD_DATE =
  process.env.NEXT_PUBLIC_BUILD_DATE ?? new Date().toISOString().split("T")[0];

export function AppFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-12">
          <div className="flex flex-col items-center sm:items-start gap-2 shrink-0">
            <Image
              src="/brand/octo-logo-full-white.png"
              alt="Orange Octo — easy accounting"
              width={160}
              height={56}
              priority={false}
              className="h-auto w-auto max-h-14 brand-logo-dark"
            />
            <Image
              src="/brand/octo-logo-full-black.png"
              alt="Orange Octo — easy accounting"
              width={160}
              height={56}
              priority={false}
              className="h-auto w-auto max-h-14 brand-logo-light"
            />
          </div>

          <div className="flex flex-wrap justify-center sm:justify-start gap-8 text-sm">
            <div>
              <p className="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wide mb-2">
                Rechtliches
              </p>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/impressum"
                    className="text-[var(--text-secondary)] hover:text-[var(--brand-orange)] transition-colors"
                  >
                    Impressum
                  </Link>
                </li>
                <li>
                  <Link
                    href="/agb"
                    className="text-[var(--text-secondary)] hover:text-[var(--brand-orange)] transition-colors"
                  >
                    AGB
                  </Link>
                </li>
                <li>
                  <Link
                    href="/datenschutz"
                    className="text-[var(--text-secondary)] hover:text-[var(--brand-orange)] transition-colors"
                  >
                    Datenschutz
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wide mb-2">
                Support
              </p>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/settings"
                    className="text-[var(--text-secondary)] hover:text-[var(--brand-orange)] transition-colors"
                  >
                    Einstellungen
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:office@vrthefans.com"
                    className="text-[var(--text-secondary)] hover:text-[var(--brand-orange)] transition-colors"
                  >
                    Kontakt
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border)] mt-6 pt-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
            <p>© {currentYear} VR the Fans GmbH. Alle Rechte vorbehalten.</p>
            <p className="font-mono">
              v{VERSION} · Build {BUILD_DATE}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
