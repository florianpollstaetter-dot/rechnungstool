"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Invoice, Customer, InvoiceStatus, Language } from "@/lib/types";
import { getInvoices, getCustomers, updateInvoice, cancelInvoice, deleteInvoice } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";

const statusConfig: { value: InvoiceStatus; label: string; color: string; bg: string }[] = [
  { value: "entwurf", label: "Entwurf", color: "text-gray-400", bg: "bg-gray-500/15 hover:bg-gray-500/25" },
  { value: "offen", label: "Offen", color: "text-amber-400", bg: "bg-amber-500/15 hover:bg-amber-500/25" },
  { value: "teilbezahlt", label: "Teilbezahlt", color: "text-cyan-400", bg: "bg-cyan-500/15 hover:bg-cyan-500/25" },
  { value: "bezahlt", label: "Bezahlt", color: "text-emerald-400", bg: "bg-emerald-500/15 hover:bg-emerald-500/25" },
  { value: "ueberfaellig", label: "Ueberfaellig", color: "text-rose-400", bg: "bg-rose-500/15 hover:bg-rose-500/25" },
];

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig.find((s) => s.value === status) || statusConfig[0];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState<{ invoice: Invoice } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [statusMenu, setStatusMenu] = useState<string | null>(null);

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

  async function handleStatusChange(id: string, status: InvoiceStatus) {
    if (status === "bezahlt" || status === "teilbezahlt") {
      const inv = invoices.find((i) => i.id === id);
      if (inv) {
        setPaymentModal({ invoice: inv });
        setPaymentAmount(String(inv.total));
        return;
      }
    }
    await updateInvoice(id, {
      status,
      paid_at: null,
      paid_amount: 0,
    });
    setStatusMenu(null);
    await loadData();
  }

  async function handlePaymentSubmit() {
    if (!paymentModal) return;
    const amount = Number(paymentAmount) || 0;
    const inv = paymentModal.invoice;
    const isFullPayment = amount >= inv.total;
    await updateInvoice(inv.id, {
      status: isFullPayment ? "bezahlt" : "teilbezahlt",
      paid_at: new Date().toISOString(),
      paid_amount: amount,
    });
    setPaymentModal(null);
    setStatusMenu(null);
    await loadData();
  }

  async function handleLanguageToggle(id: string, currentLang: Language) {
    const newLang: Language = currentLang === "de" ? "en" : "de";
    try {
      await updateInvoice(id, { language: newLang });
      await loadData();
    } catch {
      alert("Sprachumschaltung fehlgeschlagen.");
    }
  }

  async function handleCancel(id: string) {
    if (confirm("Rechnung wirklich stornieren?")) {
      await cancelInvoice(id);
      await loadData();
    }
  }

  async function handleDelete(id: string) {
    if (confirm("Rechnung wirklich loeschen?")) {
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nr.</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Faelligkeit</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Bezahlt</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">DE/EN</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {invoices.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Noch keine Rechnungen erstellt.</td></tr>
            )}
            {invoices.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((inv) => {
              const isStorniert = inv.status === "storniert";
              const isPaid = inv.status === "bezahlt";
              const isPartial = inv.status === "teilbezahlt";
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const due = new Date(inv.due_date); due.setHours(0, 0, 0, 0);
              const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
              let dueLabel = "";
              let dueColor = "text-gray-500";
              if (!isPaid && !isStorniert) {
                if (diffDays > 0) { dueLabel = `in ${diffDays}d`; dueColor = diffDays <= 3 ? "text-amber-400" : "text-gray-500"; }
                else if (diffDays === 0) { dueLabel = "heute"; dueColor = "text-amber-400"; }
                else { dueLabel = `${Math.abs(diffDays)}d ueber`; dueColor = "text-rose-400 font-medium"; }
              }
              const isEN = inv.language === "en";
              const showStatusMenu = statusMenu === inv.id;

              return (
                <tr key={inv.id} className={`hover:bg-[var(--surface-hover)] transition ${isStorniert ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3 font-medium text-white text-sm">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 max-w-[140px] truncate">{getCustomerName(inv.customer_id)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{formatDateLong(inv.invoice_date)}</td>
                  <td className={`px-4 py-3 text-sm ${dueColor}`} title={formatDateLong(inv.due_date)}>{dueLabel || formatDateLong(inv.due_date)}</td>
                  <td className="px-4 py-3 text-sm text-white text-right font-medium">{formatCurrency(inv.total)}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    {(isPaid || isPartial) ? (
                      <span className={isPaid ? "text-emerald-400" : "text-cyan-400"}>
                        {formatCurrency(inv.paid_amount)}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleLanguageToggle(inv.id, inv.language)}
                      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${isEN ? "bg-[var(--accent)]" : "bg-gray-600"}`}
                      title={isEN ? "English" : "Deutsch"}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isEN ? "translate-x-5" : "translate-x-1"}`} />
                      <span className={`absolute text-[8px] font-bold ${isEN ? "left-1" : "right-1"} text-white`}>{isEN ? "EN" : "DE"}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 relative">
                    {isStorniert ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400">Storniert</span>
                    ) : (
                      <div>
                        <button onClick={() => setStatusMenu(showStatusMenu ? null : inv.id)} className="w-full text-left">
                          <StatusBadge status={inv.status} />
                        </button>
                        {showStatusMenu && (
                          <div className="absolute z-10 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl py-1 min-w-[130px]">
                            {statusConfig.map((s) => (
                              <button
                                key={s.value}
                                onClick={() => handleStatusChange(inv.id, s.value)}
                                className={`w-full text-left px-3 py-1.5 text-xs font-medium ${s.color} hover:bg-[var(--surface-hover)] transition ${inv.status === s.value ? "bg-[var(--surface-hover)]" : ""}`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Eye icon — view */}
                      <Link href={`/invoices/${inv.id}`} className="text-[var(--accent)] hover:brightness-110 p-1" title="Ansehen">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      </Link>
                      {/* Download icon */}
                      <Link href={`/invoices/${inv.id}?download=1`} className="text-gray-500 hover:text-gray-300 p-1" title="PDF Download">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </Link>
                      {/* Trash icon — delete */}
                      {!isStorniert && (
                        <button onClick={() => handleCancel(inv.id)} className="text-rose-500 hover:text-rose-400 p-1" title="Stornieren">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      {/* Close status menu when clicking outside */}
      {statusMenu && <div className="fixed inset-0 z-0" onClick={() => setStatusMenu(null)} />}

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
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)] mb-2 no-spinners"
              autoFocus
            />

            {Number(paymentAmount) > 0 && Number(paymentAmount) < paymentModal.invoice.total && (
              <p className="text-xs text-cyan-400 mb-2">
                Teilzahlung — Restbetrag: {formatCurrency(paymentModal.invoice.total - Number(paymentAmount))}
              </p>
            )}
            {Number(paymentAmount) >= paymentModal.invoice.total && (
              <p className="text-xs text-emerald-400 mb-2">Vollstaendig bezahlt</p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setPaymentAmount(String(paymentModal.invoice.total)); }}
                className="bg-emerald-500/15 text-emerald-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500/25 transition"
              >
                Voller Betrag
              </button>
              <button
                onClick={handlePaymentSubmit}
                disabled={!paymentAmount || Number(paymentAmount) <= 0}
                className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
              >
                Zahlung erfassen
              </button>
              <button
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
