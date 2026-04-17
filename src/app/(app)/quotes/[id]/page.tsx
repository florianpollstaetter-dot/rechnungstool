"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Quote, Customer, CompanySettings, QuoteStatus, UNIT_OPTIONS, Language, DisplayMode, TemplateItem, CompanyRole, Invoice } from "@/lib/types";
import { getQuote, getCustomer, getSettings, updateQuote, createTemplate, getCompanyRoles, getInvoicesForQuote } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import PDFDownloadButton from "@/components/PDFDownloadButton";
import PDFPreviewModal from "@/components/PDFPreviewModal";
import QuoteApprovalPopup from "@/components/QuoteApprovalPopup";
import QuoteDesignWindow from "@/components/QuoteDesignWindow";
import InvoiceEditModal from "@/components/InvoiceEditModal";
import { useI18n } from "@/lib/i18n-context";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/15 text-gray-400",
  sent: "bg-blue-500/15 text-blue-400",
  accepted: "bg-emerald-500/15 text-emerald-400",
  rejected: "bg-rose-500/15 text-rose-400",
  expired: "bg-amber-500/15 text-amber-400",
};

const statusActiveColors: Record<string, string> = {
  draft: "bg-gray-500 text-white",
  sent: "bg-blue-600 text-white",
  accepted: "bg-emerald-600 text-white",
  rejected: "bg-rose-600 text-white",
  expired: "bg-amber-600 text-white",
};

const STATUS_ORDER: QuoteStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];

export default function QuoteDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [showPartialModal, setShowPartialModal] = useState(false);
  const [showInvoiceEditModal, setShowInvoiceEditModal] = useState(false);
  const [invoiceEditMode, setInvoiceEditMode] = useState<"full" | "partial">("full");
  const [showApprovalPopup, setShowApprovalPopup] = useState(false);
  const [showDesignWindow, setShowDesignWindow] = useState(false);
  const [partialMode, setPartialMode] = useState<"percent" | "amount">("percent");
  const [partialValue, setPartialValue] = useState("30");
  const [linkedInvoices, setLinkedInvoices] = useState<Invoice[]>([]);
  const [invoicedTotal, setInvoicedTotal] = useState(0);

  const loadData = useCallback(async () => {
    const q = await getQuote(params.id as string);
    if (q) {
      setQuote(q);
      const [cust, s, rolesData, invoices] = await Promise.all([getCustomer(q.customer_id), getSettings(), getCompanyRoles(), getInvoicesForQuote(q.id)]);
      if (cust) setCustomer(cust);
      setSettings(s);
      setRoles(rolesData);
      const nonCancelled = invoices.filter((inv) => inv.status !== "storniert");
      setLinkedInvoices(nonCancelled);
      setInvoicedTotal(nonCancelled.reduce((sum, inv) => sum + inv.total, 0));
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;
  if (!quote || !customer || !settings) return <div className="text-center py-12 text-gray-500">{t("quoteDetail.notFound")}</div>;

  async function handleStatusChange(status: QuoteStatus) {
    if (status === quote!.status) return;
    await updateQuote(quote!.id, { status });
    const updated = await getQuote(quote!.id);
    if (updated) setQuote(updated);
  }

  async function handleLanguageToggle() {
    const newLang: Language = quote!.language === "de" ? "en" : "de";
    try {
      await updateQuote(quote!.id, { language: newLang });
      const updated = await getQuote(quote!.id);
      if (updated) setQuote(updated);
    } catch {
      alert(t("quoteDetail.languageToggleFailed"));
    }
  }

  async function handleDisplayModeToggle() {
    const newMode: DisplayMode = quote!.display_mode === "detailed" ? "simple" : "detailed";
    await updateQuote(quote!.id, { display_mode: newMode });
    const updated = await getQuote(quote!.id);
    if (updated) setQuote(updated);
  }

  async function handleSaveAsTemplate() {
    const name = prompt(t("quoteDetail.templateName"), quote!.project_description || quote!.quote_number);
    if (!name) return;
    const items: TemplateItem[] = quote!.items.map((i) => ({
      position: i.position, description: i.description, unit: i.unit,
      product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price,
      discount_percent: i.discount_percent, discount_amount: i.discount_amount,
    }));
    await createTemplate({
      name, template_type: "quote", customer_id: quote!.customer_id,
      project_description: quote!.project_description, items,
      tax_rate: quote!.tax_rate, overall_discount_percent: quote!.overall_discount_percent,
      overall_discount_amount: quote!.overall_discount_amount,
      notes: quote!.notes, language: quote!.language || "de",
    });
    alert(t("quoteDetail.templateSaved", { name }));
  }

  function handleOpenPartialEditModal() {
    if (!quote) return;
    const val = Number(partialValue) || 0;
    if (val <= 0) return;
    setInvoiceEditMode("partial");
    setShowPartialModal(false);
    setShowInvoiceEditModal(true);
  }

  function getPartialFactor(): number {
    if (!quote) return 1;
    const val = Number(partialValue) || 0;
    const factor = partialMode === "percent" ? val / 100 : val / quote.total;
    return Math.min(factor, 1);
  }

  function getPartialLabel(): string {
    const val = Number(partialValue) || 0;
    return partialMode === "percent" ? `${val}%` : formatCurrency(val);
  }

  function getUnitLabel(unit: string) {
    return UNIT_OPTIONS.find((u) => u.value === unit)?.label || unit;
  }

  const hasDiscounts = quote.items.some((i) => i.discount_percent > 0 || i.discount_amount > 0) ||
    quote.overall_discount_percent > 0 || quote.overall_discount_amount > 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/quotes" className="text-sm text-gray-500 hover:text-[var(--text-secondary)] transition">&larr; {t("quoteDetail.backToQuotes")}</Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">{t("quoteDetail.quoteNumber", { number: quote.quote_number })}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1 bg-[var(--background)] border border-[var(--border)] rounded-lg p-1">
            {STATUS_ORDER.map((s) => {
              const isActive = quote.status === s;
              const cls = isActive
                ? statusActiveColors[s]
                : `${statusColors[s]} hover:brightness-125`;
              return (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={isActive}
                  className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${cls} ${isActive ? "cursor-default" : "cursor-pointer"}`}
                  title={isActive ? t("quoteStatus.currentStatus") : t("quoteStatus.changeTo", { status: t(`quoteStatus.${s}`) })}
                >
                  {t(`quoteStatus.${s}`)}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleLanguageToggle}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)] ${
              quote.language === "en" ? "bg-[var(--accent)]" : "bg-gray-600"
            }`}
            title={quote.language === "en" ? "English — click for Deutsch" : "Deutsch — click for English"}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${quote.language === "en" ? "translate-x-6" : "translate-x-1"}`} />
            <span className={`absolute text-[9px] font-bold ${quote.language === "en" ? "left-1.5" : "right-1.5"} text-[var(--text-primary)]`}>{quote.language === "en" ? "EN" : "DE"}</span>
          </button>
          <button
            onClick={handleDisplayModeToggle}
            className={`relative inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${
              quote.display_mode === "simple" ? "bg-[var(--accent)] text-black" : "bg-gray-600 text-[var(--text-primary)]"
            }`}
            title={quote.display_mode === "simple" ? `${t("quoteDetail.displaySimple")} — click for ${t("quoteDetail.displayDetailed")}` : `${t("quoteDetail.displayDetailed")} — click for ${t("quoteDetail.displaySimple")}`}
          >
            {quote.display_mode === "simple" ? t("quoteDetail.displaySimple") : t("quoteDetail.displayDetailed")}
          </button>
          <button onClick={() => setShowDesignWindow(true)} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-500 transition">{t("design.openDesign")}</button>
          {quote.status !== "rejected" && (
            <button onClick={() => setShowApprovalPopup(true)} className="bg-amber-600 text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-500 transition">{t("quoteDetail.release")}</button>
          )}
          {quote.status === "accepted" && (
            <>
              <button onClick={() => setShowPartialModal(true)} className="bg-cyan-600 text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-cyan-500 transition">{t("quoteDetail.partialInvoice")}</button>
              <button onClick={() => { setInvoiceEditMode("full"); setShowInvoiceEditModal(true); }} className="bg-emerald-600 text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500 transition">{t("quoteDetail.fullInvoice")}</button>
            </>
          )}
          <button onClick={handleSaveAsTemplate} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition" title={t("quoteDetail.template")}>
            {t("quoteDetail.template")}
          </button>
          <PDFDownloadButton quote={quote} customer={customer} settings={settings} onPreview={setPreviewBlob} />
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 mb-8">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t("quoteDetail.customer")}</h3>
            <p className="font-medium text-[var(--text-primary)]">{customer.company || customer.name}</p>
            {customer.company && <p className="text-sm text-gray-400">{customer.name}</p>}
            <p className="text-sm text-gray-400">{customer.address}</p>
            <p className="text-sm text-gray-400">{customer.zip} {customer.city}</p>
            {customer.uid_number && <p className="text-sm text-gray-400">{customer.uid_number}</p>}
          </div>
          <div className="sm:text-right">
            <div className="mb-2"><span className="text-sm text-gray-500">{t("quoteDetail.quoteDate")} </span><span className="font-medium text-[var(--text-primary)]">{formatDateLong(quote.quote_date)}</span></div>
            <div className="mb-2"><span className="text-sm text-gray-500">{t("quoteDetail.validUntil")} </span><span className="font-medium text-[var(--text-primary)]">{formatDateLong(quote.valid_until)}</span></div>
            {quote.project_description && <div className="mt-4"><span className="text-sm text-gray-500">{t("quoteDetail.project")} </span><span className="font-medium text-[var(--text-primary)]">{quote.project_description}</span></div>}
            {quote.converted_invoice_id && (
              <div className="mt-2">
                <Link href={`/invoices/${quote.converted_invoice_id}`} className="text-sm text-[var(--accent)] hover:brightness-110">{t("quoteDetail.toInvoice")}</Link>
              </div>
            )}
            {linkedInvoices.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium text-gray-500 uppercase">{t("quoteDetail.linkedInvoices")}</p>
                {linkedInvoices.map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`} className="block text-sm text-[var(--accent)] hover:brightness-110">
                    {inv.invoice_number} — {formatCurrency(inv.total)}
                  </Link>
                ))}
                <div className="text-xs text-gray-400 mt-1">
                  {t("quoteDetail.invoicedOf", { invoiced: formatCurrency(invoicedTotal), total: formatCurrency(quote.total) })}
                  {invoicedTotal < quote.total && (
                    <span className="text-cyan-400 ml-1">({t("quoteDetail.openAmount", { amount: formatCurrency(quote.total - invoicedTotal) })})</span>
                  )}
                  {invoicedTotal >= quote.total && (
                    <span className="text-emerald-400 ml-1">({t("quoteDetail.fullyInvoiced")})</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto mb-6">
        <table className="min-w-full">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-12">{t("quoteDetail.pos")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">{t("quoteDetail.service")}</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase py-2 w-24">{t("quoteDetail.unit")}</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-20">{t("quoteDetail.quantity")}</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">{t("quoteDetail.unitPrice")}</th>
              {hasDiscounts && <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-20">{t("quoteDetail.discount")}</th>}
              <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-32">{t("quoteDetail.role")}</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">{t("common.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, idx) => (
              <tr key={idx} className="border-b border-[var(--border)]">
                <td className="py-3 text-sm text-gray-400">{item.position}</td>
                <td className="py-3 text-sm font-medium text-[var(--text-primary)]">{item.description}</td>
                <td className="py-3 text-sm text-center text-gray-400">{getUnitLabel(item.unit)}</td>
                <td className="py-3 text-sm text-right text-gray-400">{item.quantity}</td>
                <td className="py-3 text-sm text-right text-gray-400">{formatCurrency(item.unit_price)}</td>
                {hasDiscounts && (
                  <td className="py-3 text-sm text-right text-amber-400">
                    {item.discount_percent > 0 ? `${item.discount_percent}%` : item.discount_amount > 0 ? formatCurrency(item.discount_amount) : ""}
                  </td>
                )}
                <td className="py-3 text-sm text-gray-400">
                  {item.role_id ? (() => { const role = roles.find((r) => r.id === item.role_id); return role ? (<span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: (role.color || "#6b7280") + "20", color: role.color || "#6b7280" }}>{role.name}</span>) : "—"; })() : "—"}
                </td>
                <td className="py-3 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="flex flex-col items-end space-y-1 text-sm">
          <div className="flex justify-between w-full max-w-72">
            <span className="text-gray-400">{t("quoteDetail.netTotal")}</span>
            <span className="font-medium text-[var(--text-primary)]">{formatCurrency(quote.subtotal)}</span>
          </div>
          {(quote.overall_discount_percent > 0 || quote.overall_discount_amount > 0) && (
            <div className="flex justify-between w-full max-w-72 text-amber-400">
              <span>{t("quoteDetail.overallDiscount")}</span>
              <span>{quote.overall_discount_percent > 0 && `${quote.overall_discount_percent}%`}{quote.overall_discount_amount > 0 && ` ${formatCurrency(-quote.overall_discount_amount)}`}</span>
            </div>
          )}
          <div className="flex justify-between w-full max-w-72">
            <span className="text-gray-400">{t("quoteDetail.vatAmount", { rate: quote.tax_rate })}</span>
            <span className="font-medium text-[var(--text-primary)]">{formatCurrency(quote.tax_amount)}</span>
          </div>
          <div className="flex justify-between w-full max-w-72 text-base font-bold border-t border-[var(--border)] pt-2 mt-1">
            <span className="text-[var(--text-primary)]">{t("quoteDetail.grossTotal")}</span>
            <span className="text-[var(--accent)]">{formatCurrency(quote.total)}</span>
          </div>
        </div>

        {quote.notes && (
          <div className="mt-6 pt-4 border-t border-[var(--border)]">
            <h3 className="text-sm font-medium text-gray-500 mb-1">{t("quoteDetail.notes")}</h3>
            <p className="text-sm text-gray-400">{quote.notes}</p>
          </div>
        )}
      </div>

      <PDFPreviewModal blob={previewBlob} onClose={() => setPreviewBlob(null)} />

      {showDesignWindow && (
        <QuoteDesignWindow
          quote={quote}
          customer={customer}
          settings={settings}
          onClose={() => setShowDesignWindow(false)}
          onPreview={(blob) => { setShowDesignWindow(false); setPreviewBlob(blob); }}
        />
      )}

      {showApprovalPopup && (
        <QuoteApprovalPopup
          quote={quote}
          roles={roles}
          onClose={() => setShowApprovalPopup(false)}
          onComplete={() => {
            setShowApprovalPopup(false);
            loadData();
          }}
        />
      )}

      {/* Partial Invoice Modal */}
      {showPartialModal && quote && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowPartialModal(false)}>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("quoteDetail.createPartialInvoice")}</h2>
            <p className="text-sm text-gray-400 mb-1">{t("quoteDetail.quoteLabel")} <span className="text-[var(--text-primary)] font-medium">{quote.quote_number}</span></p>
            <p className="text-sm text-gray-400 mb-4">{t("quoteDetail.totalGross")} <span className="text-[var(--text-primary)] font-medium">{formatCurrency(quote.total)}</span></p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setPartialMode("percent"); setPartialValue("30"); }}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition ${partialMode === "percent" ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"}`}
              >
                {t("quoteDetail.percent")}
              </button>
              <button
                onClick={() => { setPartialMode("amount"); setPartialValue(String(Math.round(quote.total / 3 * 100) / 100)); }}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition ${partialMode === "amount" ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"}`}
              >
                {t("quoteDetail.amount")}
              </button>
            </div>

            <label className="block text-sm font-medium text-gray-400 mb-1">
              {partialMode === "percent" ? t("quoteDetail.percentLabel") : t("quoteDetail.amountLabel")}
            </label>
            <input
              type="number"
              value={partialValue}
              onChange={(e) => setPartialValue(e.target.value)}
              step={partialMode === "percent" ? "1" : "0.01"}
              min={0}
              max={partialMode === "percent" ? 100 : undefined}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] mb-2 no-spinners"
              autoFocus
            />

            {Number(partialValue) > 0 && (
              <p className="text-xs text-cyan-400 mb-2">
                {t("quoteDetail.invoiceAmount")} {formatCurrency(
                  partialMode === "percent"
                    ? quote.total * Math.min(Number(partialValue), 100) / 100
                    : Math.min(Number(partialValue), quote.total)
                )}
              </p>
            )}

            {invoicedTotal > 0 && (
              <p className="text-xs text-gray-400 mb-2">
                {t("quoteDetail.invoicedOf", { invoiced: formatCurrency(invoicedTotal), total: formatCurrency(quote.total) })}
                {invoicedTotal < quote.total && <span className="text-cyan-400 ml-1">({t("quoteDetail.openAmount", { amount: formatCurrency(quote.total - invoicedTotal) })})</span>}
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleOpenPartialEditModal}
                disabled={!partialValue || Number(partialValue) <= 0}
                className="bg-cyan-600 text-[var(--text-primary)] px-6 py-2 rounded-lg text-sm font-semibold hover:bg-cyan-500 transition disabled:opacity-50"
              >
                {t("quoteDetail.createPartialInvoice")}
              </button>
              <button
                onClick={() => setShowPartialModal(false)}
                className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvoiceEditModal && quote && (
        <InvoiceEditModal
          quote={quote}
          mode={invoiceEditMode}
          partialFactor={invoiceEditMode === "partial" ? getPartialFactor() : 1}
          partialLabel={invoiceEditMode === "partial" ? getPartialLabel() : undefined}
          invoicedTotal={invoicedTotal}
          onClose={() => setShowInvoiceEditModal(false)}
          onCreated={(invoiceId) => {
            setShowInvoiceEditModal(false);
            router.push(`/invoices/${invoiceId}`);
          }}
        />
      )}
    </div>
  );
}
