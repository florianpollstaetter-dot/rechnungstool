"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Customer, Invoice, Quote, Receipt } from "@/lib/types";
import { getCustomer, getInvoices, getQuotes, getReceipts, updateCustomer } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import { useI18n } from "@/lib/i18n-context";
import { customerEInvoiceReadiness } from "@/lib/einvoice/customer-ready";

type EditableCustomer = Pick<
  Customer,
  "name" | "company" | "address" | "city" | "zip" | "country" | "uid_number" | "leitweg_id" | "email" | "phone"
>;

export default function CustomerDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"invoices" | "quotes" | "receipts">("invoices");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditableCustomer | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFilledKeys, setAiFilledKeys] = useState<Set<keyof EditableCustomer>>(new Set());
  const [aiResult, setAiResult] = useState<{ confidence?: string; source?: string; cost_eur?: number } | null>(null);

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

  function openEdit() {
    if (!customer) return;
    setForm({
      name: customer.name,
      company: customer.company,
      address: customer.address,
      city: customer.city,
      zip: customer.zip,
      country: customer.country,
      uid_number: customer.uid_number,
      leitweg_id: customer.leitweg_id || "",
      email: customer.email,
      phone: customer.phone,
    });
    setAiFilledKeys(new Set());
    setAiResult(null);
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm(null);
    setAiFilledKeys(new Set());
    setAiResult(null);
    setSaveError(null);
  }

  async function saveEdit() {
    if (!customer || !form) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateCustomer(customer.id, form);
      await loadData();
      setEditing(false);
      setForm(null);
      setAiFilledKeys(new Set());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("customers.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function runAiComplete() {
    if (!form) return;
    const searchName = (form.company || form.name).trim();
    if (!searchName) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch("/api/customers/ai-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: searchName }),
      });
      const data = await res.json();
      if (data.success && data.customer) {
        const filled = new Set<keyof EditableCustomer>();
        setForm((prev) => {
          if (!prev) return prev;
          const updated: EditableCustomer = { ...prev };
          const keys = Object.keys(updated) as (keyof EditableCustomer)[];
          for (const key of keys) {
            if (!updated[key] && data.customer[key]) {
              updated[key] = data.customer[key];
              filled.add(key);
            }
          }
          return updated;
        });
        setAiFilledKeys(filled);
        setAiResult({ confidence: data.confidence, source: data.source, cost_eur: data.cost?.cost_eur });
      } else {
        setAiResult({ confidence: "error", source: data.error || t("customers.aiError") });
      }
    } catch {
      setAiResult({ confidence: "error", source: t("customers.aiNetworkError") });
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;
  if (!customer) return <div className="text-center py-12 text-gray-500">{t("customers.notFound")}</div>;

  const readiness = customerEInvoiceReadiness(customer);
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
          <div className="mt-1.5 flex items-center gap-2">
            {readiness.ready ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                {t("customers.eInvoiceReadyTooltipOk")}
              </span>
            ) : (
              <span
                title={readiness.missing.join(", ")}
                className="inline-flex items-center gap-1 text-[11px] font-medium bg-rose-500/15 text-rose-400 px-2 py-0.5 rounded-full"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                {t("customers.eInvoiceReadyTooltipMissing")}: {readiness.missing.join(", ")}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-3 items-center">
          {!editing && (
            <>
              <button
                onClick={() => router.push(`/invoices?customerId=${customer.id}`)}
                className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition border border-[var(--border)]"
              >
                {t("customers.showInvoices")}
              </button>
              <button
                onClick={openEdit}
                className="bg-[var(--accent)] text-black px-3 py-1.5 rounded-lg text-sm font-semibold hover:brightness-110 transition"
              >
                {t("common.edit")}
              </button>
            </>
          )}
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

      {editing && form && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("customers.editCustomer")}</h2>
            <button
              onClick={runAiComplete}
              disabled={aiLoading || !(form.company.trim() || form.name.trim())}
              className="bg-purple-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-purple-500 transition disabled:opacity-50"
            >
              {aiLoading ? t("customers.researching") : t("customers.aiCompletion")}
            </button>
          </div>

          {aiResult && (
            <div className={`mb-3 text-xs rounded-md px-3 py-2 border ${aiResult.confidence === "error" ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
              {aiResult.confidence === "error" ? <>Error: {aiResult.source}</> : (
                <>
                  {t("customers.aiCompleted")} · {t("customers.aiSource")}: {aiResult.source}
                  {typeof aiResult.cost_eur === "number" ? ` · €${aiResult.cost_eur.toFixed(4)}` : ""}
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["name", "company", "address", "zip", "city", "country", "uid_number", "leitweg_id", "email", "phone"] as (keyof EditableCustomer)[]).map((key) => {
              const aiFilled = aiFilledKeys.has(key);
              const labelKey: Record<keyof EditableCustomer, string> = {
                name: t("common.name"),
                company: t("customers.company"),
                address: t("common.address"),
                zip: t("common.zip"),
                city: t("common.city"),
                country: t("common.country"),
                uid_number: t("customers.uidNumber"),
                leitweg_id: t("customers.leitwegId"),
                email: t("common.email"),
                phone: t("common.phone"),
              };
              return (
                <div key={key}>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1">
                    {labelKey[key]}
                    {aiFilled && <span className="text-[10px] font-semibold text-purple-400 bg-purple-500/15 px-1.5 py-0.5 rounded">{t("customers.aiSuggested")}</span>}
                  </label>
                  <input
                    type="text"
                    value={form[key]}
                    onChange={(e) => {
                      setForm({ ...form, [key]: e.target.value });
                      if (aiFilled) {
                        setAiFilledKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
                      }
                    }}
                    className={`w-full bg-[var(--background)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent border ${aiFilled ? "border-purple-500/60" : "border-[var(--border)]"}`}
                  />
                </div>
              );
            })}
          </div>

          {saveError && (
            <div className="mt-3 text-xs rounded-md px-3 py-2 border border-rose-500/40 bg-rose-500/10 text-rose-300">
              {saveError}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={saveEdit} disabled={saving} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50">
              {saving ? t("common.saving") : t("common.save")}
            </button>
            <button onClick={cancelEdit} disabled={saving} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition disabled:opacity-50">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

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
