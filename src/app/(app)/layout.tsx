"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/lib/company-context";
import { useI18n } from "@/lib/i18n-context";
import { ROLE_PERMISSIONS, AppSection, UserRole } from "@/lib/types";
import { AppFooter } from "@/components/AppFooter";
import { PaymentOverdueBanner } from "@/components/PaymentOverdueBanner";
import { PasswordChangeGate } from "@/components/PasswordChangeGate";
import { ChatWidget } from "@/components/ChatWidget";
import CompanyBadge from "@/components/CompanyBadge";
import OnboardingTour from "@/components/OnboardingTour";
import type { TranslationKey } from "@/lib/translations/de";

const GREETING_POOL_SIZE: Record<"motivating" | "challenging" | "sarcastic", number> = {
  motivating: 25,
  challenging: 10,
  sarcastic: 10,
};

const GREETING_KEY_PREFIX: Record<"motivating" | "challenging" | "sarcastic", string> = {
  motivating: "greetings",
  challenging: "greetingsChallenging",
  sarcastic: "greetingsSarcastic",
};

/** Day index used for daily rotation — stable within a calendar day (local time). */
function dayOfEpoch(): number {
  const now = new Date();
  const utcMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(utcMs / 86_400_000);
}

const NAV_ITEMS: { href: string; labelKey: TranslationKey; exact?: boolean; section: AppSection }[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", exact: true, section: "dashboard" },
  { href: "/quotes", labelKey: "nav.quotes", section: "quotes" },
  { href: "/invoices", labelKey: "nav.invoices", section: "invoices" },
  { href: "/customers", labelKey: "nav.customers", section: "customers" },
  { href: "/products", labelKey: "nav.products", section: "products" },
  { href: "/fixed-costs", labelKey: "nav.fixedCosts", section: "fixed-costs" },
  { href: "/receipts", labelKey: "nav.receipts", section: "receipts" },
  { href: "/bank", labelKey: "nav.bank", section: "bank" },
  { href: "/export", labelKey: "nav.export", section: "export" },
  { href: "/expenses", labelKey: "nav.expenses", section: "expenses" },
  { href: "/time", labelKey: "nav.time", section: "time" },
  { href: "/admin", labelKey: "nav.admin", section: "admin" },
];

/** Group definitions for the hamburger menu */
const NAV_GROUPS: { labelKey: TranslationKey; sections: AppSection[] }[] = [
  { labelKey: "nav.groupFinance", sections: ["quotes", "invoices", "receipts", "bank", "expenses", "export"] },
  { labelKey: "nav.groupAdmin", sections: ["customers", "products", "fixed-costs", "time"] },
  { labelKey: "nav.groupSystem", sections: ["admin"] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { company, accessibleCompanies, userName, userRole, roleLoaded, isSuperadmin, greetingTone, setCompanyId } = useCompany();
  const { t } = useI18n();
  const permissions = roleLoaded
    ? (ROLE_PERMISSIONS[userRole as UserRole] || ROLE_PERMISSIONS.employee)
    : [];
  const navItems = NAV_ITEMS.filter((item) => permissions.includes(item.section));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false);
  // SCH-546: during switch, await the RPC + session refresh so the reloaded
  // page's JWT already has the new company_id claim.
  const [switching, setSwitching] = useState(false);
  // SCH-546: the CompanyProvider's useState initializer returns the
  // FALLBACK_COMPANIES default during SSR (no localStorage), so SSR paints
  // the first fallback logo; after a reload triggered by the company
  // switcher, this reads as the logo "snapping back to the original" until
  // the client-side loadUserAccess finishes. Hold the real image until
  // accessibleCompanies is DB-loaded (tracked by roleLoaded).
  const logoReady = roleLoaded;
  async function handleCompanySwitch(id: string) {
    if (switching || id === company.id) {
      setShowCompanySwitcher(false);
      setMobileOpen(false);
      return;
    }
    setSwitching(true);
    setShowCompanySwitcher(false);
    setMobileOpen(false);
    await setCompanyId(id);
    window.location.reload();
  }
  const greeting = useMemo(() => {
    if (greetingTone === "off") return "";
    const size = GREETING_POOL_SIZE[greetingTone];
    const prefix = GREETING_KEY_PREFIX[greetingTone];
    const idx = dayOfEpoch() % size;
    return t(`${prefix}.${idx}` as TranslationKey, { name: "{name}" });
  }, [greetingTone, t]);

  async function handleLogout() {
    const supabase = createClient();
    localStorage.removeItem("currentUserName");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  const showCompanyDropdown = accessibleCompanies.length > 1;

  return (
    <>
      <PasswordChangeGate />
      <PaymentOverdueBanner />
      <nav className="bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center gap-3">
              {/* 1. Brand logo */}
              <Link href="/dashboard" className="flex items-center gap-2 shrink-0" title="Orange Octo">
                <Image
                  src="/brand/octo-icon-orange.png"
                  alt="Orange Octo"
                  width={32}
                  height={32}
                  className="brand-logo-dark h-8 w-8"
                  priority
                />
                <Image
                  src="/brand/octo-icon-black.png"
                  alt="Orange Octo"
                  width={32}
                  height={32}
                  className="brand-logo-light h-8 w-8"
                  priority
                />
              </Link>
              {/* 2. Dynamic greeting */}
              {userName && greeting && (
                <>
                  <div className="h-6 w-px bg-[var(--border)] shrink-0 hidden sm:block" />
                  <span className="text-[10px] sm:text-xs text-[var(--text-muted)] italic hidden lg:inline whitespace-nowrap">
                    {greeting.replace("{name}", userName)}
                  </span>
                </>
              )}
              {/* 3. Desktop nav */}
              <div className="hidden lg:flex items-center gap-1 ml-2">
                {navItems.map((item) => {
                  const active = isActive(item.href, item.exact);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`relative px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                        active
                          ? "text-[var(--text-primary)] bg-[var(--surface-hover)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      {t(item.labelKey)}
                      {active && (
                        <span className="absolute top-0 left-2 right-2 h-0.5 bg-[var(--brand-orange)] rounded-b" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* 4. Company logo — click to switch */}
              {showCompanyDropdown ? (
                <div className="relative">
                  <button
                    onClick={() => { setShowCompanySwitcher(!showCompanySwitcher); setMobileOpen(false); }}
                    className="flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
                    title={t("nav.switchCompany")}
                    disabled={switching}
                  >
                    {logoReady ? (
                      <CompanyBadge id={company.id} name={company.name} logoUrl={company.logo_url} size={24} />
                    ) : (
                      <span className="inline-block w-6 h-6 rounded" aria-hidden="true" />
                    )}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {showCompanySwitcher && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowCompanySwitcher(false)} />
                      <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl py-1 min-w-[200px]">
                        {accessibleCompanies.map((c) => (
                          <button key={c.id} onClick={() => { void handleCompanySwitch(c.id); }}
                            disabled={switching}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-hover)] transition flex items-center gap-2 disabled:opacity-60 ${company.id === c.id ? "text-[var(--brand-orange)]" : "text-[var(--text-secondary)]"}`}>
                            <CompanyBadge id={c.id} name={c.name} logoUrl={c.logo_url} size={20} />
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center px-1.5">
                  {logoReady ? (
                    <CompanyBadge id={company.id} name={company.name} logoUrl={company.logo_url} size={24} />
                  ) : (
                    <span className="inline-block w-6 h-6 rounded" aria-hidden="true" />
                  )}
                </div>
              )}
              {/* 5. Operator Console (superadmin only) */}
              {isSuperadmin && (
                <Link href="/operator" className="text-rose-500 hover:text-rose-600 transition-colors" title="Operator Console">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </Link>
              )}
              {/* 6. Settings gear */}
              <Link href="/settings" className={`transition-colors ${isActive("/settings") ? "text-[var(--brand-orange)]" : "text-gray-500 hover:text-[var(--text-primary)]"}`} title={t("nav.settings")}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </Link>
              {/* 6. Logout */}
              <button onClick={handleLogout} className="text-gray-500 hover:text-[var(--text-primary)] text-xs font-medium transition-colors hidden sm:block">
                {t("nav.logout")}
              </button>
              {/* Hamburger menu toggle — visible below lg breakpoint */}
              <button onClick={() => { setMobileOpen(!mobileOpen); setShowCompanySwitcher(false); }} className="lg:hidden text-gray-400 hover:text-[var(--text-primary)] p-1">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {mobileOpen ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></> : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
                </svg>
              </button>
            </div>
          </div>
        </div>
        {/* Hamburger menu — visible below lg breakpoint */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-[var(--border)] bg-[var(--surface)] relative z-30">
            <div className="px-4 py-3 space-y-1">
              {userName && greeting && <p className="px-3 py-1 text-xs text-[var(--text-muted)] italic">{greeting.replace("{name}", userName)}</p>}
              {/* Dashboard always first */}
              {navItems.filter((item) => item.section === "dashboard").map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive(item.href, item.exact)
                      ? "text-[var(--brand-orange)] bg-[var(--brand-orange-dim)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {t(item.labelKey)}
                </Link>
              ))}
              {/* Grouped nav items */}
              {NAV_GROUPS.map((group) => {
                const groupItems = navItems.filter((item) => group.sections.includes(item.section));
                if (groupItems.length === 0) return null;
                return (
                  <div key={group.labelKey} className="border-t border-[var(--border)] mt-2 pt-2">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t(group.labelKey)}</p>
                    {groupItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`block px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          isActive(item.href, item.exact)
                            ? "text-[var(--brand-orange)] bg-[var(--brand-orange-dim)]"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                        }`}
                      >
                        {t(item.labelKey)}
                      </Link>
                    ))}
                  </div>
                );
              })}
              {showCompanyDropdown && (
                <div className="border-t border-[var(--border)] mt-2 pt-2">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("nav.groupCompany")}</p>
                  {accessibleCompanies.map((c) => (
                    <button key={c.id} onClick={() => { void handleCompanySwitch(c.id); }}
                      disabled={switching}
                      className={`block w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-60 ${company.id === c.id ? "text-[var(--brand-orange)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {isSuperadmin && (
                <div className="border-t border-[var(--border)] mt-2 pt-2">
                  <Link
                    href="/operator"
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 text-sm font-medium text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                  >
                    Operator Console
                  </Link>
                </div>
              )}
              <div className="border-t border-[var(--border)] mt-2 pt-2">
                <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-sm font-medium text-rose-400 hover:bg-[var(--surface-hover)] rounded-lg transition-colors">
                  {t("nav.logout")}
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 w-full flex-1">
        {children}
      </main>
      <AppFooter />
      <ChatWidget />
      <OnboardingTour />
    </>
  );
}
