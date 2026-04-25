"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Quote, Customer, CompanySettings, Language, Template, QuoteStatus } from "@/lib/types";
import { getQuotes, getCustomers, getSettings, updateQuote, deleteQuote, convertQuoteToInvoice, getTemplates } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import PDFPreviewModal from "@/components/PDFPreviewModal";
import QuoteDesignWindow from "@/components/QuoteDesignWindow";
import QuoteStatusPicker from "@/components/QuoteStatusPicker";
import AngeboteTabBar from "@/components/AngeboteTabBar";
import { useI18n } from "@/lib/i18n-context";
import { useCompany } from "@/lib/company-context";

const READ_ONLY_TITLE = "Rechnung ueberfaellig — Funktionen eingeschraenkt. Bitte ausstehende Rechnung begleichen.";

export default function QuotesPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { isReadOnly } = useCompany();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [designQuoteId, setDesignQuoteId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [q, cust, s, tpl] = await Promise.all([getQuotes(), getCustomers(), getSettings(), getTemplates("quote")]);
    setQuotes(q);
    setCustomers(cust);
    setSettings(s);
    setTemplates(tpl);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function getCustomer(id: string): Customer | undefined {
    return customers.find((c) => c.id === id);
  }

  function getCustomerName(id: string): string {
    const c = getCustomer(id);
    return c ? c.company || c.name : t("quotes.unknown");
  }

  async function generatePdfBlob(q: Quote): Promise<{ blob: Blob; filename: string } | null> {
    if (!settings) return null;
    const customer = getCustomer(q.customer_id);
    if (!customer) return null;

    const { pdf } = await import("@react-pdf/renderer");
    const { default: QuotePDF } = await import("@/components/QuotePDF");

    let logoUrl = settings.logo_url;
    if (logoUrl && !logoUrl.startsWith("http")) {
      logoUrl = `${window.location.origin}${logoUrl}`;
    }
    const absSettings = { ...settings, logo_url: logoUrl || "" };

    const blob = await pdf(
      <QuotePDF quote={q} customer={customer} settings={absSettings} />
    ).toBlob();
    return { blob, filename: `Angebot_${q.quote_number.replace(/\s/g, "_")}.pdf` };
  }

  async function handleDirectDownload(q: Quote) {
    setPdfLoading(q.id);
    try {
      const result = await generatePdfBlob(q);
      if (result) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("PDF download failed:", err);
    } finally {
      setPdfLoading(null);
    }
  }

  async function handleDirectPreview(q: Quote) {
    setPdfLoading(q.id);
    try {
      const result = await generatePdfBlob(q);
      if (result) setPreviewBlob(result.blob);
    } catch (err) {
      console.error("PDF preview failed:", err);
    } finally {
      setPdfLoading(null);
    }
  }

  async function handleLanguageToggle(id: string, currentLang: Language) {
    const newLang: Language = currentLang === "de" ? "en" : "de";
    try {
      await updateQuote(id, { language: newLang });
      await loadData();
    } catch {
      alert(t("quotes.languageToggleFailed"));
    }
  }

  async function handleDelete(id: string) {
    if (confirm(t("quotes.confirmDelete"))) {
      await deleteQuote(id);
      await loadData();
    }
  }

  async function handleConvert(id: string) {
    if (confirm(t("quotes.convertToInvoice"))) {
      const invoice = await convertQuoteToInvoice(id);
      router.push(`/invoices/${invoice.id}`);
    }
  }

  async function handleStatusChange(id: string, status: QuoteStatus) {
    await updateQuote(id, { status });
    await loadData();
  }

  if (loading) return <div className="flex justify-center py-12"><div className="text-[var(--text-muted)]">{t("common.loading")}</div></div>;

  return (
    <div>
      <AngeboteTabBar />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("quotes.title")}</h1>
        <div className="flex gap-2">
          {templates.length > 0 && !isReadOnly && (
            <button onClick={() => setShowTemplateModal(true)} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">{t("quotes.fromTemplateBtn")}</button>
          )}
          {isReadOnly ? (
            <span title={READ_ONLY_TITLE} className="bg-[var(--accent)]/40 text-black/60 px-4 py-2 rounded-lg text-sm font-semibold cursor-not-allowed">+ {t("quotes.new")}</span>
          ) : (
            <Link href="/quotes/new" className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">+ {t("quotes.new")}</Link>
          )}
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("quotes.search")}
          className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-full sm:w-64"
        />
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("quotes.numberShort")}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("quotes.customer")}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("quotes.project")}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("quotes.validUntil")}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">{t("quotes.gross")}</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-[var(--text-muted)] uppercase">{t("quotes.language")}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("common.status")}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {quotes.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-[var(--text-muted)]">{t("quotes.noQuotes")}</td></tr>
            )}
            {quotes.filter((q) => {
              if (!searchQuery) return true;
              const sq = searchQuery.toLowerCase();
              return q.quote_number.toLowerCase().includes(sq)
                || getCustomerName(q.customer_id).toLowerCase().includes(sq)
                || (q.project_description || "").toLowerCase().includes(sq)
                || String(q.total).includes(sq);
            }).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((q) => {
              const isEN = q.language === "en";
              const isLoadingPdf = pdfLoading === q.id;
              return (
                <tr key={q.id} className="hover:bg-[var(--surface-hover)] transition">
                  <td className="px-6 py-4 font-medium text-[var(--text-primary)]">{q.quote_number}</td>
                  <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">{getCustomerName(q.customer_id)}</td>
                  <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">{q.project_description || "-"}</td>
                  <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">{formatDateLong(q.valid_until)}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(q.total)}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleLanguageToggle(q.id, q.language)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)] ${
                        isEN ? "bg-[var(--accent)]" : "bg-gray-600"
                      }`}
                      title={isEN ? "English — click for Deutsch" : "Deutsch — click for English"}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEN ? "translate-x-6" : "translate-x-1"}`} />
                      <span className={`absolute text-[9px] font-bold ${isEN ? "left-1.5" : "right-1.5"} text-[var(--text-primary)]`}>{isEN ? "EN" : "DE"}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <QuoteStatusPicker
                      status={q.status}
                      onChange={(next) => handleStatusChange(q.id, next)}
                      size="sm"
                    />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => setDesignQuoteId(q.id)}
                        className="text-purple-400 hover:text-purple-300 p-1"
                        title={t("design.openDesign")}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDirectPreview(q)}
                        disabled={isLoadingPdf}
                        className="text-[var(--accent)] hover:brightness-110 p-1 disabled:opacity-50"
                        title={t("quotes.preview")}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDirectDownload(q)}
                        disabled={isLoadingPdf}
                        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] p-1 disabled:opacity-50"
                        title={t("quotes.pdfDownload")}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                      {q.status === "accepted" && !q.converted_invoice_id && (
                        <button onClick={() => handleConvert(q.id)} className="text-sm text-emerald-400 hover:text-emerald-300 px-1">→ RE</button>
                      )}
                      <button onClick={() => handleDelete(q.id)} className="text-rose-500/60 hover:text-rose-400 p-1" title={t("common.delete")}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PDFPreviewModal blob={previewBlob} onClose={() => setPreviewBlob(null)} />

      {/* Design Window */}
      {designQuoteId && (() => {
        const dq = quotes.find((q) => q.id === designQuoteId);
        const dc = dq ? getCustomer(dq.customer_id) : undefined;
        if (!dq || !dc || !settings) return null;
        return (
          <QuoteDesignWindow
            quote={dq}
            customer={dc}
            settings={settings}
            onClose={() => setDesignQuoteId(null)}
            onPreview={(blob) => { setDesignQuoteId(null); setPreviewBlob(blob); }}
          />
        );
      })()}

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("quotes.fromTemplate")}</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {templates.map((tpl) => (
                <Link
                  key={tpl.id}
                  href={`/quotes/new?template=${tpl.id}`}
                  className="block bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 hover:bg-[var(--surface-hover)] transition"
                >
                  <p className="font-medium text-[var(--text-primary)] text-sm">{tpl.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{t("quotes.positions", { count: tpl.items.length })} — {tpl.project_description || t("quotes.noProjectDescription")}</p>
                </Link>
              ))}
            </div>
            <button onClick={() => setShowTemplateModal(false)} className="mt-4 bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition w-full">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
