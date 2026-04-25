"use client";

// SCH-819 Phase 2 — left-side navigation per Florian's spec.
// Accounting / Time Tracking / Admin sections; logo top-left; bottom-left
// houses Settings, Operator (superadmin), Logout.

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/lib/company-context";
import { useI18n } from "@/lib/i18n-context";
import { ROLE_PERMISSIONS, AppSection, UserRole } from "@/lib/types";
import CompanyBadge from "@/components/CompanyBadge";
import type { TranslationKey } from "@/lib/translations/de";

type IconKey =
  | "dashboard" | "quotes" | "invoices" | "fixedCosts" | "receipts" | "bank"
  | "export" | "expenses" | "customers" | "products" | "time" | "list"
  | "calendar" | "analytics" | "admin" | "settings" | "logout" | "shield"
  | "menu" | "close" | "chevronDown";

function Icon({ name, className }: { name: IconKey; className?: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  switch (name) {
    case "dashboard":
      return <svg {...common}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
    case "quotes":
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case "invoices":
      return <svg {...common}><path d="M5 3h11l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3z" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></svg>;
    case "fixedCosts":
      return <svg {...common}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>;
    case "receipts":
      return <svg {...common}><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 2V2l-1 2-3-2-3 2-3-2-3 2-3-2z" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="14" y2="13" /></svg>;
    case "bank":
      return <svg {...common}><line x1="3" y1="21" x2="21" y2="21" /><polygon points="12 3 22 9 2 9" /><line x1="6" y1="9" x2="6" y2="18" /><line x1="10" y1="9" x2="10" y2="18" /><line x1="14" y1="9" x2="14" y2="18" /><line x1="18" y1="9" x2="18" y2="18" /></svg>;
    case "export":
      return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
    case "expenses":
      return <svg {...common}><rect x="2" y="6" width="20" height="13" rx="2" /><line x1="2" y1="11" x2="22" y2="11" /><line x1="6" y1="15" x2="10" y2="15" /></svg>;
    case "customers":
      return <svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "products":
      return <svg {...common}><path d="M16.5 9.4 7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
    case "time":
      return <svg {...common}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case "list":
      return <svg {...common}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
    case "analytics":
      return <svg {...common}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
    case "admin":
      return <svg {...common}><circle cx="12" cy="7" r="4" /><path d="M5.5 21a8.38 8.38 0 0 1 13 0" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case "logout":
      return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case "menu":
      return <svg {...common}><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>;
    case "close":
      return <svg {...common}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
    case "chevronDown":
      return <svg {...common} width="14" height="14"><polyline points="6 9 12 15 18 9" /></svg>;
  }
}

interface NavLeaf {
  href: string;
  labelKey: TranslationKey;
  icon: IconKey;
  exact?: boolean;
  section?: AppSection;
}

const ACCOUNTING_ITEMS: NavLeaf[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "dashboard", exact: true, section: "dashboard" },
  { href: "/quotes", labelKey: "nav.quotes", icon: "quotes", section: "quotes" },
  { href: "/invoices", labelKey: "nav.invoices", icon: "invoices", section: "invoices" },
  { href: "/customers", labelKey: "nav.customers", icon: "customers", section: "customers" },
  { href: "/products", labelKey: "nav.products", icon: "products", section: "products" },
  { href: "/fixed-costs", labelKey: "nav.fixedCosts", icon: "fixedCosts", section: "fixed-costs" },
  { href: "/receipts", labelKey: "nav.receipts", icon: "receipts", section: "receipts" },
  { href: "/bank", labelKey: "nav.bank", icon: "bank", section: "bank" },
  { href: "/export", labelKey: "nav.export", icon: "export", section: "export" },
  { href: "/expenses", labelKey: "nav.expenses", icon: "expenses", section: "expenses" },
];

const TIME_ITEMS: NavLeaf[] = [
  { href: "/time?view=list", labelKey: "time.list", icon: "list", section: "time" },
  { href: "/time?view=calendar", labelKey: "time.calendar", icon: "calendar", section: "time" },
  { href: "/time?view=analytics", labelKey: "time.analytics", icon: "analytics", section: "time" },
];

export default function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const { company, accessibleCompanies, userName, userRole, roleLoaded, isSuperadmin, setCompanyId } = useCompany();
  const permissions = roleLoaded
    ? (ROLE_PERMISSIONS[userRole as UserRole] || ROLE_PERMISSIONS.employee)
    : [];

  const accountingItems = ACCOUNTING_ITEMS.filter((i) => !i.section || permissions.includes(i.section));
  const timeAllowed = permissions.includes("time");
  const adminAllowed = permissions.includes("admin");

  const [mobileOpen, setMobileOpen] = useState(false);
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false);
  const [switching, setSwitching] = useState(false);
  const showCompanyDropdown = accessibleCompanies.length > 1;
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

  async function handleLogout() {
    const supabase = createClient();
    localStorage.removeItem("currentUserName");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isAccountingActive(item: NavLeaf) {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href.split("?")[0]);
  }

  function isTimeViewActive(href: string) {
    const view = href.split("=")[1];
    if (typeof window === "undefined") return false;
    if (!pathname.startsWith("/time")) return false;
    const params = new URLSearchParams(window.location.search);
    const current = params.get("view") || "list";
    return current === view;
  }

  const navContent = (
    <>
      {/* Logo */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-4 py-4 shrink-0"
        title="Orange Octo"
        onClick={() => setMobileOpen(false)}
      >
        <Image
          src="/brand/octo-icon-orange.png"
          alt="Orange Octo"
          width={40}
          height={40}
          className="brand-logo-dark h-10 w-10"
          priority
        />
        <Image
          src="/brand/octo-icon-black.png"
          alt="Orange Octo"
          width={40}
          height={40}
          className="brand-logo-light h-10 w-10"
          priority
        />
        <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          Orange<span className="text-[var(--brand-orange)]">Octo</span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Hauptnavigation">
        {/* Accounting */}
        {accountingItems.length > 0 && (
          <div className="mb-4">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {t("nav.sectionAccounting")}
            </p>
            <ul className="space-y-0.5">
              {accountingItems.map((item) => {
                const active = isAccountingActive(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-[var(--brand-orange-dim)] text-[var(--brand-orange)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Icon name={item.icon} className="shrink-0" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Time Tracking */}
        {timeAllowed && (
          <div className="mb-4">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {t("nav.sectionTimeTracking")}
            </p>
            <ul className="space-y-0.5">
              {TIME_ITEMS.map((item) => {
                const active = isTimeViewActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-[var(--brand-orange-dim)] text-[var(--brand-orange)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Icon name={item.icon} className="shrink-0" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>

      {/* Bottom: Admin & Settings + company switcher + logout */}
      <div className="border-t border-[var(--border)] px-2 py-3 shrink-0">
        <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {t("nav.sectionAdmin")}
        </p>
        <ul className="space-y-0.5">
          {showCompanyDropdown && (
            <li className="relative">
              <button
                type="button"
                onClick={() => setShowCompanySwitcher((v) => !v)}
                disabled={switching}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                title={t("nav.switchCompany")}
              >
                {logoReady ? (
                  <CompanyBadge id={company.id} name={company.name} logoUrl={company.logo_url} size={18} />
                ) : (
                  <span className="inline-block w-[18px] h-[18px] rounded shrink-0" aria-hidden="true" />
                )}
                <span className="truncate flex-1 text-left">{company.name}</span>
                <Icon name="chevronDown" className="shrink-0 text-[var(--text-muted)]" />
              </button>
              {showCompanySwitcher && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCompanySwitcher(false)} />
                  <div className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl py-1 mx-2">
                    {accessibleCompanies.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { void handleCompanySwitch(c.id); }}
                        disabled={switching}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-hover)] transition flex items-center gap-2 disabled:opacity-60 ${
                          company.id === c.id ? "text-[var(--brand-orange)]" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        <CompanyBadge id={c.id} name={c.name} logoUrl={c.logo_url} size={20} />
                        <span className="truncate">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </li>
          )}
          {adminAllowed && (
            <li>
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-[var(--brand-orange-dim)] text-[var(--brand-orange)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon name="admin" className="shrink-0" />
                <span className="truncate">{t("nav.admin")}</span>
              </Link>
            </li>
          )}
          {isSuperadmin && (
            <li>
              <Link
                href="/operator"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-rose-500 hover:bg-rose-500/10 transition-colors"
              >
                <Icon name="shield" className="shrink-0" />
                <span className="truncate">{t("nav.operatorConsole")}</span>
              </Link>
            </li>
          )}
          <li>
            <Link
              href="/settings"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith("/settings")
                  ? "bg-[var(--brand-orange-dim)] text-[var(--brand-orange)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon name="settings" className="shrink-0" />
              <span className="truncate">{t("nav.settings")}</span>
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-rose-400 transition-colors"
            >
              <Icon name="logout" className="shrink-0" />
              <span className="truncate text-left flex-1">{t("nav.logout")}</span>
            </button>
          </li>
        </ul>
        {userName && (
          <p className="px-3 pt-3 pb-1 text-[11px] text-[var(--text-muted)] truncate" title={userName}>
            {userName}
          </p>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar with menu button */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-[var(--surface)] border-b border-[var(--border)] px-4 h-14">
        <Link href="/dashboard" className="flex items-center gap-2" title="Orange Octo">
          <Image src="/brand/octo-icon-orange.png" alt="Orange Octo" width={32} height={32} className="brand-logo-dark h-8 w-8" priority />
          <Image src="/brand/octo-icon-black.png" alt="Orange Octo" width={32} height={32} className="brand-logo-light h-8 w-8" priority />
          <span className="text-sm font-semibold text-[var(--text-primary)]">Orange<span className="text-[var(--brand-orange)]">Octo</span></span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label={t("nav.openSidebar")}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
        >
          <Icon name="menu" />
        </button>
      </header>

      {/* Desktop sidebar (always visible at lg+) */}
      <aside
        className="hidden lg:flex flex-col fixed top-0 left-0 bottom-0 w-60 bg-[var(--surface)] border-r border-[var(--border)] z-30"
        aria-label="Hauptnavigation"
      >
        {navContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="lg:hidden fixed top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-[var(--surface)] border-r border-[var(--border)] z-50 flex flex-col"
            aria-label="Hauptnavigation"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label={t("nav.closeSidebar")}
              className="absolute top-3 right-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 z-10"
            >
              <Icon name="close" />
            </button>
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}
