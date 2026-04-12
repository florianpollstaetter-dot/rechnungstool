"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Invoice, Customer, InvoiceStatus, Language } from "@/lib/types";
import { getInvoices, getCustomers, updateInvoice, cancelInvoice, deleteInvoice } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";

const statusConfig: { value: InvoiceStatus; label: string; color: string; activeColor: string }[] = [
  { value: "entwurf", label: "Entwurf", color: "text-gray-500 hover:text-gray-300", activeColor: "bg-gray-500/20 text-gray-300 ring-1 ring-gray-500/40" },
  { value: "offen", label: "Offen", color: "text-amber-500/60 hover:text-amber-400", activeColor: "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40" },
  { value: "teilbezahlt", label: "Teil", color: "text-cyan-500/60 hover:text-cyan-400", activeColor: "bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40" },
  { value: "bezahlt", label: "Bezahlt", color: "text-emerald-500/60 hover:text-emerald-400", activeColor: "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40" },
  { value: "ueberfaellig", label: "Ueberfaellig", color: "text-rose-500/60 hover:text-rose-400", activeColor: "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40" },
];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState<{ invoice: Invoice } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  const loadData = useCallback(async () => {
    const [inv, cust] = await Promise.all([getInvoices(), getCustomers()]);
    setInvoices(inv);
    setCustomers(cust);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function getCustomerName(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? c.company || c.name : "Unbekannt";
  }

  function openPaymentModal(inv: Invoice) {
    setPaymentModal({ invoice: inv });
    setPaymentAmount(String(inv.total));
  }

  async function handleStatusClick(id: string, status: InvoiceStatus) {
    if (status === "bezahlt" || status === "teilbezahlt") {
      const inv = invoices.find((i) => i.id === id);
      if (inv) { openPaymentModal(inv); return; }
    }
    await updateInvoice(id, { status, paid_at: null, paid_amount: 0 });
    await loadData();
  }

  async function submitPayment() {
    if (!paymentModal) return;
    const amount = Number(paymentAmount) || 0;
    if (amount <= 0) return;
    const inv = paymentModal.invoice;
    const isFullPayment = amount >= inv.total;
    await updateInvoice(inv.id, {
      status: isFullPayment ? "bezahlt" : "teilbezahlt",
      paid_at: new Date().toISOString(),
      paid_amount: amount,
    });
    setPaymentModal(null);
    setPaymentAmount("");
    await loadData();
  }

  async function handleLanguageToggle(id: string, currentLang: Language) {
    const newLang: Language = currentLang === "de" ? "en" : "de";
    await updateInvoice(id, { language: newLang }).catch(() => {});
    await loadData();
  }

  async function handleCancel(id: string) {
    if (confirm("Rechnung wirklich stornieren?")) { await cancelInvoice(id); await loadData(); }
  }

  async function handleDelete(id: string) {
    if (confirm("Rechnung wirklich loeschen?")) { await deleteInvoice(id); await loadData(); }
  }

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    invoices.forEach(async (inv) => {
      if (inv.status === "offen" && inv.due_date < today) {
        await updateInvoice(inv.id, { status: "ueberfaellig" });
      }
    });
  }, [invoices]);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Rechnungen</h1>
        <Link href="/invoices/new" className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">+ Neue Rechnung</Link>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nr.</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Bezahlt</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">DE/EN</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {invoices.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">Noch keine Rechnungen erstellt.</td></tr>
            )}
            {invoices.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((inv) => {
              const isStorniert = inv.status === "storniert";
              const isPaid = inv.status === "bezahlt";
              const isPartial = inv.status === "teilbezahlt";
              const isEN = inv.language === "en";

              return (
                <tr key={inv.id} className={`hover:bg-[var(--surface-hover)] transition ${isStorniert ? "opacity-50" : ""}`}>
                  <td className="px-3 py-3 font-medium text-white text-sm">{inv.invoice_number}</td>
                  <td className="px-3 py-3 text-sm text-gray-400 max-w-[120px] truncate">{getCustomerName(inv.customer_id)}</td>
                  <td className="px-3 py-3 text-sm text-gray-400">{formatDateLong(inv.invoice_date)}</td>
                  <td className="px-3 py-3 text-sm text-white text-right font-medium">{formatCurrency(inv.total)}</td>
                  <td className="px-3 py-3 text-sm text-right">
                    {(isPaid || isPartial) ? (
                      <span className={isPaid ? "text-emerald-400" : "text-cyan-400"}>{formatCurrency(inv.paid_amount)}</span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => handleLanguageToggle(inv.id, inv.language)}
                      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${isEN ? "bg-[var(--accent)]" : "bg-gray-600"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isEN ? "translate-x-5" : "translate-x-1"}`} />
                      <span className={`absolute text-[8px] font-bold ${isEN ? "left-1" : "right-1"} text-white`}>{isEN ? "EN" : "DE"}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {isStorniert ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/15 text-purple-400">Storniert</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {statusConfig.map((s) => (
                          <button
                            key={s.value}
                            onClick={() => handleStatusClick(inv.id, s.value)}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition text-left ${
                              inv.status === s.value ? s.activeColor : s.color
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/invoices/${inv.id}`} className="text-[var(--accent)] hover:brightness-110 p-1" title="Ansehen">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      </Link>
                      <Link href={`/invoices/${inv.id}?download=1`} className="text-gray-500 hover:text-gray-300 p-1" title="PDF Download">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </Link>
                      {!isStorniert && (
                        <button onClick={() => handleCancel(inv.id)} className="text-rose-500/60 hover:text-rose-400 p-1" title="Stornieren">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPaymentModal(null)}>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white mb-4">Zahlung erfassen</h2>
            <p className="text-sm text-gray-400 mb-1">Rechnung: <span className="text-white font-medium">{paymentModal.invoice.invoice_number}</span></p>
            <p className="text-sm text-gray-400 mb-4">Bruttobetrag: <span className="text-white font-medium">{formatCurrency(paymentModal.invoice.total)}</span></p>

            <label className="block text-sm font-medium text-gray-400 mb-1">Gezahlter Betrag (brutto)</label>
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              step="0.01"
              min={0}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)] mb-3 no-spinners"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") submitPayment(); }}
            />

            {Number(paymentAmount) > 0 && Number(paymentAmount) < paymentModal.invoice.total && (
              <p className="text-xs text-cyan-400 mb-3">Teilzahlung — Restbetrag: {formatCurrency(paymentModal.invoice.total - Number(paymentAmount))}</p>
            )}
            {Number(paymentAmount) >= paymentModal.invoice.total && (
              <p className="text-xs text-emerald-400 mb-3">Vollstaendig bezahlt</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentAmount(String(paymentModal.invoice.total))}
                className="bg-emerald-500/15 text-emerald-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500/25 transition"
              >
                Voller Betrag
              </button>
              <button
                type="button"
                onClick={submitPayment}
                className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
              >
                Zahlung erfassen
              </button>
              <button
                type="button"
                onClick={() => setPaymentModal(null)}
                className="bg-[var(--surface-hover)] text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
