"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Invoice, Customer, Quote, CompanySettings, FixedCost } from "@/lib/types";
import { getInvoices, getCustomers, getQuotes, getSettings, getActiveFixedCosts } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import { getFactOfTheDay } from "@/lib/i18n";

function getChuckNorrisFact(): string {
  const facts = [
    "Chuck Norris kann eine Steuererklarung prufen, bevor sie eingereicht wird.",
    "Chuck Norris braucht keinen Steuerberater. Der Steuerberater braucht Chuck Norris.",
    "Wenn Chuck Norris eine Rechnung schreibt, bezahlt sich der Kunde selbst.",
    "Chuck Norris kann Rechnungen mit einem Blick stornieren.",
    "Die USt-Voranmeldung reicht sich selbst ein, wenn Chuck Norris in der Naehe ist.",
    "Chuck Norris' IBAN hat nur 4 Stellen. Die Bank hat Angst, mehr zu verlangen.",
    "Chuck Norris debuggt Code, indem er den Monitor anstarrt, bis der Bug gesteht.",
    "Wenn Chuck Norris Enter drueckt, kompiliert das gesamte Internet neu.",
    "Chuck Norris kann mit einem Roundhouse-Kick eine Excel-Tabelle in eine Datenbank verwandeln.",
    "Chuck Norris braucht kein Backup. Seine Daten haben Angst zu verschwinden.",
    "Chuck Norris hat einmal eine Rechnung an sich selbst geschickt. Er hat sofort bezahlt — aus Respekt.",
    "Chuck Norris kann PDFs mit bloessen Haenden unterschreiben.",
    "Wenn Chuck Norris eine Mahnung schickt, kommt das Geld zurueck, bevor die Post zugestellt wird.",
    "Chuck Norris' Buchhaltung ist immer auf den Cent genau. Die Cents runden sich selbst.",
    "Chuck Norris' Geschaeftsjahr hat 13 Monate. Der 13. heisst 'Chucktober'.",
  ];
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return facts[dayOfYear % facts.length];
}

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

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
  const partialInvoices = activeInvoices.filter((i) => i.status === "teilbezahlt");

  const totalRevenueGross = paidInvoices.reduce((sum, i) => sum + i.total, 0);
  const totalOpenGross = openInvoices.reduce((sum, i) => sum + i.total, 0) + partialInvoices.reduce((sum, i) => sum + (i.total - i.paid_amount), 0);
  const totalOverdueGross = overdueInvoices.reduce((sum, i) => sum + i.total, 0);

  const totalVAT = activeInvoices.filter((i) => i.status !== "entwurf").reduce((sum, i) => sum + i.tax_amount, 0);

  // Monthly revenue (current month)
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthlyPaid = paidInvoices.filter((i) => {
    const d = new Date(i.paid_at || i.invoice_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const monthlyRevenueGross = monthlyPaid.reduce((sum, i) => sum + i.total, 0);

  const openQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");

  const monthlyFixedCosts = fixedCosts.reduce((sum, c) => {
    if (c.interval === "monthly") return sum + c.amount;
    if (c.interval === "quarterly") return sum + c.amount / 3;
    return sum + c.amount / 12;
  }, 0);

  function getCustomerName(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? c.company || c.name : "Unbekannt";
  }

  const recentInvoices = [...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const recentQuotes = [...quotes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  const cards = [
    {
      title: "Umsatz", href: "/invoices?filter=bezahlt",
      value: formatCurrency(monthlyRevenueGross),
      subtitle: `Monat | Gesamt: ${formatCurrency(totalRevenueGross)}`,
      borderColor: "border-emerald-500", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
    },
    {
      title: "Offene Rechnungen", href: "/invoices?filter=offen",
      value: formatCurrency(totalOpenGross),
      subtitle: `${openInvoices.length + partialInvoices.length} offen/teil`,
      borderColor: "border-amber-500", iconBg: "bg-amber-500/10", iconColor: "text-amber-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    },
    {
      title: "Ueberfaellig", href: "/invoices?filter=ueberfaellig",
      value: formatCurrency(totalOverdueGross),
      subtitle: `${overdueInvoices.length} ueberfaellig`,
      borderColor: "border-rose-500", iconBg: "bg-rose-500/10", iconColor: "text-rose-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>,
    },
    {
      title: "Umsatzsteuer", href: "/invoices",
      value: formatCurrency(totalVAT),
      subtitle: `${settings?.company_type === "gmbh" ? "Soll-Besteuerung" : "Ist-Besteuerung"}`,
      borderColor: "border-orange-500", iconBg: "bg-orange-500/10", iconColor: "text-orange-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="m9 12 2 2 4-4" /></svg>,
    },
    {
      title: "Kunden / Angebote", href: "/customers",
      value: String(customers.length),
      subtitle: `${openQuotes.length} offene Angebote`,
      borderColor: "border-[var(--accent)]", iconBg: "bg-[var(--accent-dim)]", iconColor: "text-[var(--accent)]",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    },
    {
      title: "Fixkosten", href: "/fixed-costs",
      value: formatCurrency(monthlyFixedCosts),
      subtitle: `${fixedCosts.length} aktive / ${formatCurrency(monthlyFixedCosts * 12)} p.a.`,
      borderColor: "border-cyan-500", iconBg: "bg-cyan-500/10", iconColor: "text-cyan-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>,
    },
  ];

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/quotes/new" className="bg-[var(--surface-hover)] text-gray-300 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-[var(--border)] transition">+ Angebot</Link>
          <Link href="/invoices/new" className="bg-[var(--accent)] text-black px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold hover:brightness-110 transition">+ Rechnung</Link>
        </div>
      </div>

      {/* 6 cards in 2 rows of 3 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {cards.map((card) => (
          <Link key={card.title} href={card.href} className={`bg-[var(--surface)] rounded-xl border-l-4 ${card.borderColor} border border-[var(--border)] p-5 hover:bg-[var(--surface-hover)] transition cursor-pointer`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center ${card.iconColor}`}>{card.icon}</div>
              <p className="text-sm font-medium text-gray-400">{card.title}</p>
            </div>
            <p className="text-2xl font-bold text-white">{card.value}</p>
            <p className="text-xs text-gray-600 mt-1">{card.subtitle}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Invoices */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)]">
          <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Letzte Rechnungen</h2>
            <Link href="/invoices" className="text-xs text-[var(--accent)] hover:brightness-110">Alle anzeigen</Link>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">Noch keine Rechnungen.</div>
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
                    : inv.status === "teilbezahlt" ? "bg-cyan-500/15 text-cyan-400"
                    : inv.status === "ueberfaellig" ? "bg-rose-500/15 text-rose-400"
                    : inv.status === "storniert" ? "bg-purple-500/15 text-purple-400"
                    : "bg-amber-500/15 text-amber-400";
                  const statusText = inv.status === "bezahlt" ? "Bezahlt" : inv.status === "teilbezahlt" ? "Teilbezahlt" : inv.status === "ueberfaellig" ? "Ueberfaellig" : inv.status === "storniert" ? "Storniert" : "Offen";
                  return (
                    <tr key={inv.id} className="hover:bg-[var(--surface-hover)] transition">
                      <td className="px-6 py-4"><Link href={`/invoices/${inv.id}`} className="font-medium text-[var(--accent)] hover:brightness-110">{inv.invoice_number}</Link></td>
                      <td className="px-6 py-4 text-sm text-gray-400">{getCustomerName(inv.customer_id)}</td>
                      <td className="px-6 py-4 text-sm text-right font-medium text-white">{formatCurrency(inv.total)}</td>
                      <td className="px-6 py-4"><span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyle}`}>{statusText}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Quotes */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)]">
          <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Letzte Angebote</h2>
            <Link href="/quotes" className="text-xs text-[var(--accent)] hover:brightness-110">Alle anzeigen</Link>
          </div>
          {recentQuotes.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">Noch keine Angebote.</div>
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
                {recentQuotes.map((q) => {
                  const statusStyle = q.status === "accepted" ? "bg-emerald-500/15 text-emerald-400"
                    : q.status === "rejected" ? "bg-rose-500/15 text-rose-400"
                    : q.status === "sent" ? "bg-blue-500/15 text-blue-400"
                    : "bg-gray-500/15 text-gray-400";
                  const statusText = q.status === "accepted" ? "Angenommen" : q.status === "rejected" ? "Abgelehnt" : q.status === "sent" ? "Gesendet" : "Entwurf";
                  return (
                    <tr key={q.id} className="hover:bg-[var(--surface-hover)] transition">
                      <td className="px-6 py-4"><Link href={`/quotes/${q.id}`} className="font-medium text-[var(--accent)] hover:brightness-110">{q.quote_number}</Link></td>
                      <td className="px-6 py-4 text-sm text-gray-400">{getCustomerName(q.customer_id)}</td>
                      <td className="px-6 py-4 text-sm text-right font-medium text-white">{formatCurrency(q.total)}</td>
                      <td className="px-6 py-4"><span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyle}`}>{statusText}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Fact of the Day + Chuck Norris */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[var(--accent)] text-sm font-semibold">Fact of the Day</span>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">{getFactOfTheDay("de")}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-orange-400 text-sm font-semibold">Chuck Norris Fact</span>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">{getChuckNorrisFact()}</p>
        </div>
      </div>
    </div>
  );
}
