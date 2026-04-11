"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Invoice, Customer, InvoiceStatus, Language } from "@/lib/types";
import { getInvoices, getCustomers, updateInvoice, cancelInvoice, deleteInvoice } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";

const statusLabels: Record<string, { label: string; color: string }> = {
  entwurf: { label: "Entwurf", color: "bg-gray-500/15 text-gray-400" },
  offen: { label: "Offen", color: "bg-amber-500/15 text-amber-400" },
  bezahlt: { label: "Bezahlt", color: "bg-emerald-500/15 text-emerald-400" },
  ueberfaellig: { label: "Ueberfaellig", color: "bg-rose-500/15 text-rose-400" },
  storniert: { label: "Storniert", color: "bg-purple-500/15 text-purple-400" },
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [inv, cust] = await Promise.all([getInvoices(), getCustomers()]);
    setInvoices(inv);
    setCustomers(cust);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function getCustomerName(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? c.company || c.name : "Unbekannt";
  }

  async function handleStatusChange(id: string, status: InvoiceStatus) {
    await updateInvoice(id, {
      status,
      paid_at: status === "bezahlt" ? new Date().toISOString() : null,
    });
    await loadData();
  }

  async function handleLanguageToggle(id: string, currentLang: Language) {
    const newLang: Language = currentLang === "de" ? "en" : "de";
    try {
      await updateInvoice(id, { language: newLang });
      await loadData();
    } catch {
      alert("Sprachumschaltung fehlgeschlagen. Bitte Datenbank-Migration ausfuehren.");
    }
  }

  async function handleCancel(id: string) {
    if (confirm("Rechnung wirklich stornieren? Die Rechnungsnummer bleibt erhalten.")) {
      await cancelInvoice(id);
      await loadData();
    }
  }

  async function handleDelete(id: string) {
    if (confirm("Rechnung wirklich loeschen? ACHTUNG: Die Rechnungsnummer hinterlaesst eine Luecke in der Nummerierung. Dies kann steuerrechtlich problematisch sein.")) {
      await deleteInvoice(id);
      await loadData();
    }
  }

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    invoices.forEach(async (inv) => {
      if (inv.status === "offen" && inv.due_date < today) {
        await updateInvoice(inv.id, { status: "ueberfaellig" });
      }
    });
  }, [invoices]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-500">Laden...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Rechnungen</h1>
        <Link
          href="/invoices/new"
          className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
        >
          + Neue Rechnung
        </Link>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nr.</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projekt</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Faelligkeit</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Netto</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sprache</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {invoices.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                  Noch keine Rechnungen erstellt.
                </td>
              </tr>
            )}
            {invoices
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((inv) => {
                const st = statusLabels[inv.status] || statusLabels.offen;
                const isStorniert = inv.status === "storniert";
                const isPaid = inv.status === "bezahlt";
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const due = new Date(inv.due_date);
                due.setHours(0, 0, 0, 0);
                const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
                let dueLabel = "";
                let dueColor = "text-gray-500";
                if (!isPaid && !isStorniert) {
                  if (diffDays > 0) {
                    dueLabel = `in ${diffDays} Tag${diffDays !== 1 ? "en" : ""}`;
                    dueColor = diffDays <= 3 ? "text-amber-400" : "text-gray-500";
                  } else if (diffDays === 0) {
                    dueLabel = "heute";
                    dueColor = "text-amber-400";
                  } else {
                    dueLabel = `seit ${Math.abs(diffDays)} Tag${Math.abs(diffDays) !== 1 ? "en" : ""}`;
                    dueColor = "text-rose-400 font-medium";
                  }
                }
                const isEN = inv.language === "en";
                return (
                  <tr key={inv.id} className={`hover:bg-[var(--surface-hover)] transition ${isStorniert ? "opacity-60" : ""}`}>
                    <td className="px-6 py-4 font-medium text-white">{inv.invoice_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">{getCustomerName(inv.customer_id)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-[150px] truncate">{inv.project_description || "—"}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">{formatDateLong(inv.invoice_date)}</td>
                    <td className={`px-6 py-4 text-sm ${dueColor}`} title={formatDateLong(inv.due_date)}>{dueLabel || formatDateLong(inv.due_date)}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-400">{formatCurrency(inv.subtotal)}</td>
                    <td className="px-6 py-4 text-sm text-white text-right font-medium">{formatCurrency(inv.total)}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleLanguageToggle(inv.id, inv.language)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)] ${
                          isEN ? "bg-[var(--accent)]" : "bg-gray-600"
                        }`}
                        title={isEN ? "English — click for Deutsch" : "Deutsch — click for English"}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isEN ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                        <span className={`absolute text-[9px] font-bold ${isEN ? "left-1.5" : "right-1.5"} text-white`}>
                          {isEN ? "EN" : "DE"}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {isStorniert ? (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${st.color}`}>{st.label}</span>
                      ) : (
                        <select
                          value={inv.status}
                          onChange={(e) => handleStatusChange(inv.id, e.target.value as InvoiceStatus)}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 bg-transparent ${st.color}`}
                        >
                          <option value="entwurf">Entwurf</option>
                          <option value="offen">Offen</option>
                          <option value="bezahlt">Bezahlt</option>
                          <option value="ueberfaellig">Ueberfaellig</option>
                        </select>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <Link href={`/invoices/${inv.id}`} className="text-sm text-[var(--accent)] hover:brightness-110 mr-2">Ansehen</Link>
                      {!isStorniert && (
                        <button onClick={() => handleCancel(inv.id)} className="text-sm text-rose-400 hover:text-rose-300 mr-2">Stornieren</button>
                      )}
                      <button onClick={() => handleDelete(inv.id)} className="text-sm text-gray-600 hover:text-gray-400">Loeschen</button>
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
