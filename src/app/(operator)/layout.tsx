"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AppFooter } from "@/components/AppFooter";

const OPERATOR_NAV = [
  { href: "/operator", label: "Dashboard", exact: true },
  { href: "/operator/companies", label: "Firmen" },
  { href: "/operator/users", label: "User" },
  { href: "/operator/billing", label: "Abo & Billing" },
  { href: "/operator/audit", label: "Audit Log" },
];

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    const supabase = createClient();
    localStorage.removeItem("currentUserName");
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <>
      <nav className="bg-[var(--surface)] border-b-2 border-rose-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center gap-3">
              <Link href="/operator" className="flex items-center gap-2 shrink-0" title="Operator Console">
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
              <div className="h-6 w-px bg-[var(--border)] shrink-0 hidden sm:block" />
              <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider hidden sm:inline">
                Operator Console
              </span>
              {/* Desktop nav */}
              <div className="hidden md:flex items-center gap-1 ml-2">
                {OPERATOR_NAV.map((item) => {
                  const active = isActive(item.href, item.exact);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`relative px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        active
                          ? "text-[var(--text-primary)] bg-[var(--surface-hover)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      {item.label}
                      {active && (
                        <span className="absolute top-0 left-2 right-2 h-0.5 bg-rose-500 rounded-b" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors hidden sm:block"
              >
                Zurück zur App
              </Link>
              <button onClick={handleLogout} className="text-gray-500 hover:text-[var(--text-primary)] text-xs font-medium transition-colors hidden sm:block">
                Abmelden
              </button>
              {/* Mobile hamburger */}
              <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-gray-400 hover:text-[var(--text-primary)] p-1">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {mobileOpen ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></> : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
                </svg>
              </button>
            </div>
          </div>
        </div>
        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-[var(--border)] bg-[var(--surface)]">
            <div className="px-4 py-3 space-y-1">
              {OPERATOR_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive(item.href, item.exact)
                      ? "text-rose-500 bg-rose-500/10"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <Link href="/" className="block px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors">
                Zurück zur App
              </Link>
              <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-sm font-medium text-rose-400 hover:bg-[var(--surface-hover)] rounded-lg transition-colors">
                Abmelden
              </button>
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
