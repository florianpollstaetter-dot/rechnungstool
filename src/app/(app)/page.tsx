"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Invoice, Customer, Quote, CompanySettings, FixedCost } from "@/lib/types";
import { getInvoices, getCustomers, getQuotes, getSettings, getActiveFixedCosts } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface MonthlyVAT {
  month: string;
  label: string;
  netto: number;
  ust: number;
  brutto: number;
}

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  function toggleMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const loadData = useCallback(async () => {
    const [inv, cust, q, s, fc] = await Promise.all([getInvoices(), getCustomers(), getQuotes(), getSettings(), getActiveFixedCosts()]);
    setInvoices(inv);
    setCustomers(cust);
    setQuotes(q);
    setSettings(s);
    setFixedCosts(fc);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const activeInvoices = invoices.filter((i) => i.status !== "storniert");
  const openInvoices = activeInvoices.filter((i) => i.status === "offen");
  const overdueInvoices = activeInvoices.filter((i) => i.status === "ueberfaellig");
  const paidInvoices = activeInvoices.filter((i) => i.status === "bezahlt");

  const totalRevenueGross = paidInvoices.reduce((sum, i) => sum + i.total, 0);
  const totalRevenueNet = paidInvoices.reduce((sum, i) => sum + i.subtotal, 0);
  const totalOpenGross = openInvoices.reduce((sum, i) => sum + i.total, 0);
  const totalOpenNet = openInvoices.reduce((sum, i) => sum + i.subtotal, 0);
  const totalOverdueGross = overdueInvoices.reduce((sum, i) => sum + i.total, 0);
  const totalOverdueNet = overdueInvoices.reduce((sum, i) => sum + i.subtotal, 0);

  const openQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");

  const monthlyFixedCosts = fixedCosts.reduce((sum, c) => {
    if (c.interval === "monthly") return sum + c.amount;
    if (c.interval === "quarterly") return sum + c.amount / 3;
    return sum + c.amount / 12;
  }, 0);

  const companyType = settings?.company_type || "gmbh";
  const isSollBesteuerung = companyType === "gmbh";

  const vatInvoices = isSollBesteuerung
    ? activeInvoices.filter((i) => i.status !== "entwurf")
    : activeInvoices.filter((i) => i.status === "bezahlt" && i.paid_at);
  const monthlyVAT: MonthlyVAT[] = (() => {
    const map = new Map<string, MonthlyVAT>();
    vatInvoices.forEach((inv) => {
      const dateStr = isSollBesteuerung ? inv.invoice_date : inv.paid_at!;
      const d = new Date(dateStr);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      const existing = map.get(key) || { month: key, label, netto: 0, ust: 0, brutto: 0 };
      existing.netto += inv.subtotal;
      existing.ust += inv.tax_amount;
      existing.brutto += inv.total;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
  })();

  const acceptedQuotes = quotes.filter((q) => q.status === "accepted" && !q.converted_invoice_id);

  function getCustomerName(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? c.company || c.name : "Unbekannt";
  }

  const cards = [
    {
      title: "Gesamtumsatz",
      valueGross: formatCurrency(totalRevenueGross),
      valueNet: formatCurrency(totalRevenueNet),
      subtitle: `${paidInvoices.length} bezahlte Rechnungen`,
      borderColor: "border-emerald-500",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      title: "Offene Rechnungen",
      valueGross: formatCurrency(totalOpenGross),
      valueNet: formatCurrency(totalOpenNet),
      subtitle: `${openInvoices.length} offen`,
      borderColor: "border-amber-500",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-400",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      title: "Ueberfaellig",
      valueGross: formatCurrency(totalOverdueGross),
      valueNet: formatCurrency(totalOverdueNet),
      subtitle: `${overdueInvoices.length} ueberfaellig`,
      borderColor: "border-rose-500",
      iconBg: "bg-rose-500/10",
      iconColor: "text-rose-400",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
        </svg>
      ),
    },
    {
      title: "Kunden / Angebote",
      valueGross: String(customers.length),
      valueNet: `${openQuotes.length} offene Angebote`,
      subtitle: `${quotes.length} Angebote gesamt`,
      borderColor: "border-[var(--accent)]",
      iconBg: "bg-[var(--accent-dim)]",
      iconColor: "text-[var(--accent)]",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      title: "Fixkosten",
      valueGross: formatCurrency(monthlyFixedCosts),
      valueNet: formatCurrency(monthlyFixedCosts * 12),
      subtitle: `${fixedCosts.length} aktive Positionen`,
      borderColor: "border-cyan-500",
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-400",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
      ),
    },
  ];

  const recentInvoices = [...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/quotes/new" className="bg-[var(--surface-hover)] text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">+ Neues Angebot</Link>
          <Link href="/invoices/new" className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">+ Neue Rechnung</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.title} className={`bg-[var(--surface)] rounded-xl border-l-4 ${card.borderColor} border border-[var(--border)] p-5 hover:bg-[var(--surface-hover)] transition`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center ${card.iconColor}`}>
                {card.icon}
              </div>
              <p className="text-sm font-medium text-gray-400">{card.title}</p>
            </div>
            <p className="text-2xl font-bold text-white">{card.valueGross}</p>
            <p className="text-sm text-gray-500 mt-0.5">Netto: {card.valueNet}</p>
            <p className="text-xs text-gray-600 mt-1">{card.subtitle}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Invoices */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)]">
          <div className="px-6 py-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold text-white">Letzte Rechnungen</h2>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              Noch keine Rechnungen erstellt.{" "}
              <Link href="/invoices/new" className="text-[var(--accent)] hover:brightness-110">Erste Rechnung erstellen</Link>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-[var(--border)]">
              <thead className="bg-[var(--background)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nr.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {recentInvoices.map((inv) => {
                  const statusStyle = inv.status === "bezahlt" ? "bg-emerald-500/15 text-emerald-400"
                    : inv.status === "ueberfaellig" ? "bg-rose-500/15 text-rose-400"
                    : inv.status === "storniert" ? "bg-purple-500/15 text-purple-400"
                    : "bg-amber-500/15 text-amber-400";
                  const statusText = inv.status === "bezahlt" ? "Bezahlt"
                    : inv.status === "ueberfaellig" ? "Ueberfaellig"
                    : inv.status === "storniert" ? "Storniert"
                    : "Offen";
                  return (
                    <tr key={inv.id} className="hover:bg-[var(--surface-hover)] transition">
                      <td className="px-6 py-4">
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-[var(--accent)] hover:brightness-110">{inv.invoice_number}</Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">{getCustomerName(inv.customer_id)}</td>
                      <td className="px-6 py-4 text-sm text-right font-medium text-white">{formatCurrency(inv.total)}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyle}`}>{statusText}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Monthly VAT Overview */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)]">
          <div className="px-6 py-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold text-white">Monatliche Umsatzsteuer</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isSollBesteuerung ? "Soll-Besteuerung — USt faellig bei Rechnungsstellung" : "Ist-Besteuerung — USt faellig bei Zahlungseingang"}
            </p>
          </div>
          {monthlyVAT.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">Noch keine gestellten Rechnungen.</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {monthlyVAT.map((m) => {
                const isOpen = openMonths.has(m.month);
                return (
                  <div key={m.month}>
                    <button
                      onClick={() => toggleMonth(m.month)}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-white">{m.label}</span>
                        <span className="text-sm font-bold text-amber-400">{formatCurrency(m.ust)} USt</span>
                      </div>
                      <ChevronIcon open={isOpen} />
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-4 grid grid-cols-3 gap-3">
                        <div className="bg-[var(--background)] rounded-lg p-3">
                          <p className="text-xs text-gray-500">Netto</p>
                          <p className="text-sm font-semibold text-white">{formatCurrency(m.netto)}</p>
                        </div>
                        <div className="bg-amber-500/10 rounded-lg p-3">
                          <p className="text-xs text-gray-500">USt</p>
                          <p className="text-sm font-semibold text-amber-400">{formatCurrency(m.ust)}</p>
                        </div>
                        <div className="bg-[var(--background)] rounded-lg p-3">
                          <p className="text-xs text-gray-500">Brutto</p>
                          <p className="text-sm font-semibold text-white">{formatCurrency(m.brutto)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="px-6 py-4 bg-[var(--background)] flex items-center justify-between">
                <span className="text-sm font-bold text-white">Gesamt</span>
                <div className="flex gap-6 text-sm">
                  <span className="text-gray-400">Netto: <strong className="text-white">{formatCurrency(monthlyVAT.reduce((s, m) => s + m.netto, 0))}</strong></span>
                  <span className="text-amber-400">USt: <strong>{formatCurrency(monthlyVAT.reduce((s, m) => s + m.ust, 0))}</strong></span>
                  <span className="text-gray-400">Brutto: <strong className="text-white">{formatCurrency(monthlyVAT.reduce((s, m) => s + m.brutto, 0))}</strong></span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Accepted Quotes Not Yet Invoiced */}
      {acceptedQuotes.length > 0 && (
        <div className="mb-8">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 mb-4">
            <p className="text-sm font-medium text-emerald-400">Angenommene Angebote — Gesamtsumme</p>
            <p className="text-2xl font-bold text-emerald-300 mt-1">{formatCurrency(acceptedQuotes.reduce((sum, q) => sum + q.total, 0))}</p>
            <p className="text-xs text-emerald-500 mt-1">{acceptedQuotes.length} Angebot{acceptedQuotes.length !== 1 ? "e" : ""} noch nicht in Rechnungen konvertiert</p>
          </div>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)]">
          <table className="min-w-full divide-y divide-[var(--border)]">
            <thead className="bg-[var(--background)]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nr.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projekt</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {acceptedQuotes.map((q) => (
                <tr key={q.id} className="hover:bg-[var(--surface-hover)] transition">
                  <td className="px-6 py-4">
                    <Link href={`/quotes/${q.id}`} className="font-medium text-[var(--accent)] hover:brightness-110">{q.quote_number}</Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">{getCustomerName(q.customer_id)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{q.project_description || "—"}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium text-white">{formatCurrency(q.total)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/quotes/${q.id}`} className="text-sm text-emerald-400 hover:text-emerald-300 font-medium">Rechnung erstellen</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
