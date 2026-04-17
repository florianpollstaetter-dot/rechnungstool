"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Customer, Invoice, Quote, Receipt } from "@/lib/types";
import { getCustomer, getInvoices, getQuotes, getReceipts } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import { useI18n } from "@/lib/i18n-context";

export default function CustomerDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"invoices" | "quotes" | "receipts">("invoices");

  const loadData = useCallback(async () => {
    const cust = await getCustomer(params.id as string);
    if (cust) {
      setCustomer(cust);
      const [inv, q, rec] = await Promise.all([getInvoices(), getQuotes(), getReceipts()]);
      setInvoices(inv.filter((i) => i.customer_id === cust.id));
      setQuotes(q.filter((q) => q.customer_id === cust.id));
      setReceipts(rec.filter((r) => (r.issuer || "").toLowerCase().includes((cust.company || cust.name).toLowerCase())));
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;
  if (!customer) return <div className="text-center py-12 text-gray-500">{t("customers.notFound")}</div>;

  const totalRevenue = invoices.filter((i) => i.status === "bezahlt").reduce((s, i) => s + i.total, 0);
  const totalOpen = invoices.filter((i) => ["offen", "teilbezahlt", "ueberfaellig"].includes(i.status)).reduce((s, i) => s + i.total, 0);

  const filteredInvoices = invoices.filter((i) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return i.invoice_number.toLowerCase().includes(q) || String(i.total).includes(q) || (i.project_description || "").toLowerCase().includes(q);
  });

  const filteredQuotes = quotes.filter((q) => {
    if (!searchQuery) return true;
    const sq = searchQuery.toLowerCase();
    return q.quote_number.toLowerCase().includes(sq) || String(q.total).includes(sq) || (q.project_description || "").toLowerCase().includes(sq);
  });

  const tabs = [
    { key: "invoices" as const, label: `${t("customerDetail.invoices")} (${invoices.length})` },
    { key: "quotes" as const, label: `${t("customerDetail.quotes")} (${quotes.length})` },
    { key: "receipts" as const, label: `${t("customerDetail.receipts")} (${receipts.length})` },
  ];

  return (
    <div>
      <Link href="/customers" className="text-sm text-gray-500 hover:text-[var(--text-secondary)] transition">&larr; {t("customerDetail.backToCustomers")}</Link>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{customer.company || customer.name}</h1>
          {customer.company && <p className="text-sm text-[var(--text-secondary)]">{customer.name}</p>}
          <p className="text-sm text-[var(--text-muted)]">{customer.address}, {customer.zip} {customer.city}</p>
          {customer.uid_number && <p className="text-xs text-[var(--text-muted)]">UID: {customer.uid_number}</p>}
        </div>
        <div className="flex gap-3">
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)]">{t("customerDetail.revenuePaid")}</p>
            <p className="text-lg font-bold text-emerald-400">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)]">{t("customerDetail.open")}</p>
            <p className="text-lg font-bold text-amber-400">{formatCurrency(totalOpen)}</p>
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex gap-1.5">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition ${activeTab === tab.key ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}
            >{tab.label}</button>
          ))}
        </div>
        <div className="sm:ml-auto">
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("common.search")} className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-full sm:w-56" />
        </div>
      </div>

      {/* Invoices Tab */}
      {activeTab === "invoices" && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)]">
            <thead className="bg-[var(--background)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("invoices.numberShort")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.date")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("invoiceNew.projectDescription")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("common.gross")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("common.vat")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredInvoices.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">{t("customerDetail.noInvoices")}</td></tr>}
              {filteredInvoices.sort((a, b) => b.invoice_date.localeCompare(a.invoice_date)).map((inv) => {
                const statusStyle = inv.status === "bezahlt" ? "bg-emerald-500/15 text-emerald-400"
                  : inv.status === "teilbezahlt" ? "bg-cyan-500/15 text-cyan-400"
                  : inv.status === "storniert" ? "bg-purple-500/15 text-purple-400"
                  : "bg-amber-500/15 text-amber-400";
                return (
                  <tr key={inv.id} className="hover:bg-[var(--surface-hover)] transition cursor-pointer" onClick={() => window.location.href = `/invoices/${inv.id}`}>
                    <td className="px-4 py-3 text-sm font-medium text-[var(--accent)]">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatDateLong(inv.invoice_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{inv.project_description || "—"}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(inv.total)}</td>
                    <td className="px-4 py-3 text-sm text-right text-orange-400">{formatCurrency(inv.tax_amount)}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle}`}>{inv.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Quotes Tab */}
      {activeTab === "quotes" && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)]">
            <thead className="bg-[var(--background)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("invoices.numberShort")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.date")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("invoiceNew.projectDescription")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("common.gross")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredQuotes.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">{t("customerDetail.noQuotes")}</td></tr>}
              {filteredQuotes.sort((a, b) => b.quote_date.localeCompare(a.quote_date)).map((q) => (
                <tr key={q.id} className="hover:bg-[var(--surface-hover)] transition cursor-pointer" onClick={() => window.location.href = `/quotes/${q.id}`}>
                  <td className="px-4 py-3 text-sm font-medium text-[var(--accent)]">{q.quote_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{formatDateLong(q.quote_date)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{q.project_description || "—"}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(q.total)}</td>
                  <td className="px-4 py-3"><span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400">{q.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Receipts Tab */}
      {activeTab === "receipts" && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)]">
            <thead className="bg-[var(--background)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("customerDetail.receipts")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.date")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("common.gross")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {receipts.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">{t("customerDetail.noReceipts")}</td></tr>}
              {receipts.map((r) => (
                <tr key={r.id} className="hover:bg-[var(--surface-hover)] transition">
                  <td className="px-4 py-3 text-sm text-[var(--text-primary)]">{r.purpose || r.file_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{r.invoice_date || "—"}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-[var(--text-primary)]">{r.amount_gross != null ? formatCurrency(r.amount_gross) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
