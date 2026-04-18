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
import type { TranslationKey } from "@/lib/translations/de";

const GREETING_COUNT = 25;

const NAV_ITEMS: { href: string; labelKey: TranslationKey; exact?: boolean; section: AppSection }[] = [
  { href: "/", labelKey: "nav.dashboard", exact: true, section: "dashboard" },
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
  const { company, accessibleCompanies, userName, userRole, roleLoaded, isSuperadmin, setCompanyId } = useCompany();
  const { t } = useI18n();
  const permissions = roleLoaded
    ? (ROLE_PERMISSIONS[userRole as UserRole] || ROLE_PERMISSIONS.employee)
    : [];
  const navItems = NAV_ITEMS.filter((item) => permissions.includes(item.section));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false);
  const greetingIdx = useMemo(() => Math.floor(Math.random() * GREETING_COUNT), []);
  const greeting = t(`greetings.${greetingIdx}` as TranslationKey, { name: "{name}" });

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
              <Link href="/" className="flex items-center gap-2 shrink-0" title="Orange Octo">
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
              {userName && (
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
                  >
                    <Image src={company.logo_url} alt={company.name} width={24} height={24} className="rounded" style={{ filter: "var(--logo-filter)" }} />
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {showCompanySwitcher && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowCompanySwitcher(false)} />
                      <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl py-1 min-w-[200px]">
                        {accessibleCompanies.map((c) => (
                          <button key={c.id} onClick={() => { setCompanyId(c.id); setShowCompanySwitcher(false); window.location.reload(); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-hover)] transition flex items-center gap-2 ${company.id === c.id ? "text-[var(--brand-orange)]" : "text-[var(--text-secondary)]"}`}>
                            <Image src={c.logo_url} alt={c.name} width={20} height={20} className="rounded" style={{ filter: "var(--logo-filter)" }} />
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center px-1.5">
                  <Image src={company.logo_url} alt={company.name} width={24} height={24} className="rounded" style={{ filter: "var(--logo-filter)" }} />
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
              {userName && <p className="px-3 py-1 text-xs text-[var(--text-muted)] italic">{greeting.replace("{name}", userName)}</p>}
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
                    <button key={c.id} onClick={() => { setCompanyId(c.id); setMobileOpen(false); window.location.reload(); }}
                      className={`block w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors ${company.id === c.id ? "text-[var(--brand-orange)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>
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
    </>
  );
}
