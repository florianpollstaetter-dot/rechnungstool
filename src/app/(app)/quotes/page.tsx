"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Quote, Customer, QuoteStatus, Language } from "@/lib/types";
import { getQuotes, getCustomers, updateQuote, deleteQuote, convertQuoteToInvoice } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: "Entwurf", color: "bg-gray-500/15 text-gray-400" },
  sent: { label: "Gesendet", color: "bg-blue-500/15 text-blue-400" },
  accepted: { label: "Angenommen", color: "bg-emerald-500/15 text-emerald-400" },
  rejected: { label: "Abgelehnt", color: "bg-rose-500/15 text-rose-400" },
  expired: { label: "Abgelaufen", color: "bg-amber-500/15 text-amber-400" },
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [q, cust] = await Promise.all([getQuotes(), getCustomers()]);
    setQuotes(q);
    setCustomers(cust);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function getCustomerName(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? c.company || c.name : "Unbekannt";
  }

  async function handleLanguageToggle(id: string, currentLang: Language) {
    const newLang: Language = currentLang === "de" ? "en" : "de";
    try {
      await updateQuote(id, { language: newLang });
      await loadData();
    } catch {
      alert("Sprachumschaltung fehlgeschlagen. Bitte Datenbank-Migration ausfuehren.");
    }
  }

  async function handleStatusChange(id: string, status: QuoteStatus) {
    await updateQuote(id, { status });
    await loadData();
  }

  async function handleDelete(id: string) {
    if (confirm("Angebot wirklich loeschen?")) {
      await deleteQuote(id);
      await loadData();
    }
  }

  async function handleConvert(id: string) {
    if (confirm("Angebot zu Rechnung konvertieren?")) {
      await convertQuoteToInvoice(id);
      await loadData();
    }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Angebote</h1>
        <Link href="/quotes/new" className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">+ Neues Angebot</Link>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nr.</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projekt</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gueltig bis</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sprache</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {quotes.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">Noch keine Angebote erstellt.</td></tr>
            )}
            {quotes.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((q) => {
              const st = statusLabels[q.status] || statusLabels.draft;
              const isEN = q.language === "en";
              return (
                <tr key={q.id} className="hover:bg-[var(--surface-hover)] transition">
                  <td className="px-6 py-4 font-medium text-white">{q.quote_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{getCustomerName(q.customer_id)}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{q.project_description || "-"}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{formatDateLong(q.valid_until)}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium text-white">{formatCurrency(q.total)}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleLanguageToggle(q.id, q.language)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)] ${
                        isEN ? "bg-[var(--accent)]" : "bg-gray-600"
                      }`}
                      title={isEN ? "English — click for Deutsch" : "Deutsch — click for English"}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEN ? "translate-x-6" : "translate-x-1"}`} />
                      <span className={`absolute text-[9px] font-bold ${isEN ? "left-1.5" : "right-1.5"} text-white`}>{isEN ? "EN" : "DE"}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <select value={q.status} onChange={(e) => handleStatusChange(q.id, e.target.value as QuoteStatus)} className={`text-xs font-medium px-2 py-1 rounded-full border-0 bg-transparent ${st.color}`}>
                      <option value="draft">Entwurf</option>
                      <option value="sent">Gesendet</option>
                      <option value="accepted">Angenommen</option>
                      <option value="rejected">Abgelehnt</option>
                      <option value="expired">Abgelaufen</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link href={`/quotes/${q.id}`} className="text-sm text-[var(--accent)] hover:brightness-110">Ansehen</Link>
                    {q.status !== "accepted" && !q.converted_invoice_id && (
                      <button onClick={() => handleConvert(q.id)} className="text-sm text-emerald-400 hover:text-emerald-300">→ Rechnung</button>
                    )}
                    <button onClick={() => handleDelete(q.id)} className="text-sm text-rose-400 hover:text-rose-300">Loeschen</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
