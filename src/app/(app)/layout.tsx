"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany, COMPANIES } from "@/lib/company-context";

const navItems = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/quotes", label: "Angebote" },
  { href: "/invoices", label: "Rechnungen" },
  { href: "/customers", label: "Kunden" },
  { href: "/products", label: "Produkte" },
  { href: "/fixed-costs", label: "Fixkosten" },
  { href: "/receipts", label: "Belege" },
  { href: "/bank", label: "Konto" },
  { href: "/export", label: "Export" },
  { href: "/admin", label: "Admin" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { company, accessibleCompanies, userName, setCompanyId } = useCompany();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <>
      <nav className="bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 shrink-0">
                <Image src={company.logo_path} alt={company.name} width={36} height={36} className="rounded" style={{ filter: "var(--logo-filter)" }} />
              </Link>
              {userName && <span className="text-[10px] sm:text-xs text-[var(--text-muted)] italic">You rock my world, <strong className="text-[var(--text-primary)] not-italic">{userName}</strong>!</span>}
              {/* Desktop nav */}
              <div className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      isActive(item.href, item.exact)
                        ? "text-[var(--accent)] bg-[var(--accent)]/10"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Company switcher */}
              <div className="relative">
                <button onClick={() => setShowCompanySwitcher(!showCompanySwitcher)} className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded transition hidden sm:block" title="Unternehmen wechseln">
                  {company.name.split(" ")[0]}
                </button>
                {showCompanySwitcher && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowCompanySwitcher(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl py-1 min-w-[200px]">
                      {accessibleCompanies.map((c) => (
                        <button key={c.id} onClick={() => { setCompanyId(c.id); setShowCompanySwitcher(false); window.location.reload(); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-hover)] transition flex items-center gap-2 ${company.id === c.id ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>
                          <Image src={c.logo_path} alt={c.name} width={20} height={20} className="rounded" style={{ filter: "var(--logo-filter)" }} />
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <Link href="/settings" className={`transition-colors ${isActive("/settings") ? "text-[var(--accent)]" : "text-gray-500 hover:text-[var(--text-primary)]"}`} title="Einstellungen">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
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
              {userName && <p className="px-3 py-1 text-xs text-[var(--text-muted)]">Angemeldet als: <span className="text-[var(--text-primary)] font-medium">{userName}</span></p>}
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive(item.href, item.exact)
                      ? "text-[var(--accent)] bg-[var(--accent)]/10"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="border-t border-[var(--border)] mt-2 pt-2">
                <p className="px-3 py-1 text-xs text-[var(--text-muted)]">Unternehmen wechseln:</p>
                {accessibleCompanies.map((c) => (
                  <button key={c.id} onClick={() => { setCompanyId(c.id); setMobileOpen(false); window.location.reload(); }}
                    className={`block w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors ${company.id === c.id ? "text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"}`}>
                    {c.name}
                  </button>
                ))}
              </div>
              <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-sm font-medium text-rose-400 hover:bg-[var(--surface-hover)] rounded-lg transition-colors">
                Abmelden
              </button>
            </div>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 w-full">
        {children}
      </main>
    </>
  );
}
