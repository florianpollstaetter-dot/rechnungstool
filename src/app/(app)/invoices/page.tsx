"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Invoice, Customer, CompanySettings, InvoiceStatus, Language, Template, EInvoiceFormat } from "@/lib/types";
import { getInvoices, getCustomers, getSettings, updateInvoice, cancelInvoice, deleteInvoice, createInvoice, getTemplates } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import PDFPreviewModal from "@/components/PDFPreviewModal";
import { useI18n } from "@/lib/i18n-context";
import { useCompany } from "@/lib/company-context";

const READ_ONLY_TITLE = "Rechnung ueberfaellig — Funktionen eingeschraenkt. Bitte ausstehende Rechnung begleichen.";

function isOverdue(inv: Invoice): boolean {
  if (inv.status === "bezahlt" || inv.status === "storniert") return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(inv.due_date); due.setHours(0, 0, 0, 0);
  return due < today;
}

export default function InvoicesPageWrapper() {
  const { t } = useI18n();
  return <Suspense fallback={<div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>}><InvoicesPage /></Suspense>;
}

function InvoicesPage() {
  const { t } = useI18n();

  const statusConfig: { value: InvoiceStatus; label: string; color: string; activeColor: string }[] = [
    { value: "entwurf", label: t("invoiceStatus.entwurf"), color: "text-gray-500 hover:text-[var(--text-secondary)]", activeColor: "bg-gray-500/20 text-[var(--text-secondary)] ring-1 ring-gray-500/40" },
    { value: "offen", label: t("invoiceStatus.offen"), color: "text-amber-500/60 hover:text-amber-400", activeColor: "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40" },
    { value: "teilbezahlt", label: t("invoiceStatus.teilbezahlt"), color: "text-cyan-500/60 hover:text-cyan-400", activeColor: "bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40" },
    { value: "bezahlt", label: t("invoiceStatus.bezahlt"), color: "text-emerald-500/60 hover:text-emerald-400", activeColor: "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40" },
  ];

  const filterTabs = [
    { value: "alle", label: t("common.all") },
    { value: "entwurf", label: t("invoiceStatus.entwurf") },
    { value: "offen", label: t("invoiceStatus.offen") },
    { value: "bezahlt", label: t("invoiceStatus.bezahlt") },
    { value: "ueberfaellig", label: t("invoiceStatus.ueberfaellig") },
  ];

  const { company, isReadOnly } = useCompany();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState<{ invoice: Invoice } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") || "alle";
  const customerFilter = searchParams.get("customerId") || "";
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState("");
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [eInvoiceLoading, setEInvoiceLoading] = useState<string | null>(null);
  const [eInvoiceError, setEInvoiceError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const loadData = useCallback(async () => {
    const [inv, cust, s, tpl] = await Promise.all([getInvoices(), getCustomers(), getSettings(), getTemplates("invoice")]);
    setInvoices(inv);
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
    return c ? c.company || c.name : "Unbekannt";
  }

  async function generatePdfBlob(inv: Invoice): Promise<{ blob: Blob; filename: string } | null> {
    if (!settings) return null;
    const customer = getCustomer(inv.customer_id);
    if (!customer) return null;

    const { pdf } = await import("@react-pdf/renderer");
    const { default: InvoicePDF } = await import("@/components/InvoicePDF");

    let logoUrl = settings.logo_url;
    if (logoUrl && !logoUrl.startsWith("http")) {
      logoUrl = `${window.location.origin}${logoUrl}`;
    }
    const absSettings = { ...settings, logo_url: logoUrl || "" };

    const blob = await pdf(
      <InvoicePDF invoice={inv} customer={customer} settings={absSettings} />
    ).toBlob();
    return { blob, filename: `Rechnung_${inv.invoice_number.replace(/\s/g, "_")}.pdf` };
  }

  async function handleDirectDownload(inv: Invoice) {
    setPdfLoading(inv.id);
    try {
      const result = await generatePdfBlob(inv);
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

  async function handleEInvoiceDirect(inv: Invoice) {
    if (!settings) return;
    const customer = getCustomer(inv.customer_id);
    if (!customer) return;
    setEInvoiceLoading(inv.id);
    setEInvoiceError(null);
    try {
      // Auto-select: XRechnung for DE + Leitweg-ID, else ZUGFeRD. Respect an
      // already-set format on the invoice.
      const existing = inv.e_invoice_format;
      const chosen: Exclude<EInvoiceFormat, "none"> =
        existing === "xrechnung" || existing === "zugferd"
          ? existing
          : customer.country === "DE" && (customer.leitweg_id || "").trim()
            ? "xrechnung"
            : "zugferd";

      if (!existing || existing === "none") {
        await updateInvoice(inv.id, { e_invoice_format: chosen });
      }

      if (chosen === "xrechnung") {
        const res = await fetch("/api/einvoice/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: inv.id, companyId: company.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(formatValidation(data));
        const blob = new Blob([data.xml], { type: "application/xml" });
        downloadBlob(blob, `XRechnung_${inv.invoice_number.replace(/\s/g, "_")}.xml`);
      } else {
        const pdfResult = await generatePdfBlob(inv);
        if (!pdfResult) throw new Error("PDF Erstellung fehlgeschlagen");
        const buf = await pdfResult.blob.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ""),
        );
        const res = await fetch("/api/einvoice/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: inv.id, companyId: company.id, pdfBase64: base64 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(formatValidation(data));
        const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0));
        downloadBlob(new Blob([bytes], { type: "application/pdf" }), `ZUGFeRD_${inv.invoice_number.replace(/\s/g, "_")}.pdf`);
      }
      await loadData();
    } catch (err) {
      setEInvoiceError(err instanceof Error ? err.message : String(err));
    } finally {
      setEInvoiceLoading(null);
    }
  }

  function formatValidation(data: { error?: string; validation?: { errors: { message: string }[] } }): string {
    if (data.validation?.errors?.length) {
      const lines = data.validation.errors.slice(0, 3).map((e) => `• ${e.message}`).join("\n");
      const more = data.validation.errors.length > 3 ? `\n…+${data.validation.errors.length - 3} weitere` : "";
      return `E-Rechnung nicht EN-16931-konform:\n${lines}${more}`;
    }
    return data.error || "Generation fehlgeschlagen";
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleDirectPreview(inv: Invoice) {
    setPdfLoading(inv.id);
    try {
      const result = await generatePdfBlob(inv);
      if (result) setPreviewBlob(result.blob);
    } catch (err) {
      console.error("PDF preview failed:", err);
    } finally {
      setPdfLoading(null);
    }
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
    try {
      await updateInvoice(inv.id, {
        status: isFullPayment ? "bezahlt" : "teilbezahlt",
        paid_at: new Date().toISOString(),
        paid_amount: amount,
      });
      setPaymentModal(null);
      setPaymentAmount("");
      await loadData();
    } catch (err) {
      console.error("Payment update failed:", err);
      alert("Zahlung konnte nicht gespeichert werden. Bitte DB-Migration ausfuehren (teilbezahlt Status).");
    }
  }

  async function handleLanguageToggle(id: string, currentLang: Language) {
    const newLang: Language = currentLang === "de" ? "en" : "de";
    await updateInvoice(id, { language: newLang }).catch(() => {});
    await loadData();
  }

  async function handleCancel(id: string) {
    if (!confirm("Rechnung wirklich stornieren? Es wird automatisch eine Stornorechnung erstellt.")) return;
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;
    await cancelInvoice(id);
    // Auto-create Stornorechnung (negative amounts)
    await createInvoice({
      customer_id: inv.customer_id,
      project_description: `STORNO zu ${inv.invoice_number}`,
      invoice_date: new Date().toISOString().split("T")[0],
      delivery_date: inv.delivery_date,
      due_date: new Date().toISOString().split("T")[0],
      items: inv.items.map((item) => ({
        id: crypto.randomUUID(),
        position: item.position,
        description: `STORNO: ${item.description}`,
        unit: item.unit,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: -item.unit_price,
        discount_percent: item.discount_percent,
        discount_amount: item.discount_amount,
        total: -item.total,
      })),
      subtotal: -inv.subtotal,
      tax_rate: inv.tax_rate,
      tax_amount: -inv.tax_amount,
      total: -inv.total,
      overall_discount_percent: inv.overall_discount_percent,
      overall_discount_amount: inv.overall_discount_amount,
      status: "storniert",
      paid_at: null,
      paid_amount: 0,
      notes: `Stornorechnung zu Rechnung ${inv.invoice_number}`,
      language: inv.language,
      accompanying_text: null,
      e_invoice_format: inv.e_invoice_format || "none",
        created_by: null,
    });
    await loadData();
  }

  async function handleDelete(id: string) {
    if (confirm("Rechnung wirklich löschen?")) { await deleteInvoice(id); await loadData(); }
  }

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    invoices.forEach(async (inv) => {
      if (inv.status === "offen" && inv.due_date < today) {
        await updateInvoice(inv.id, { status: "ueberfaellig" });
      }
    });
  }, [invoices]);

  // Filter logic
  const filteredInvoices = invoices
    .filter((inv) => (customerFilter ? inv.customer_id === customerFilter : true))
    .filter((inv) => {
      if (activeFilter === "alle") return true;
      if (activeFilter === "offen") return inv.status === "offen" || inv.status === "teilbezahlt";
      if (activeFilter === "bezahlt") return inv.status === "bezahlt" || inv.status === "teilbezahlt";
      if (activeFilter === "ueberfaellig") return isOverdue(inv);
      return inv.status === activeFilter;
    })
    .filter((inv) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const customerName = getCustomerName(inv.customer_id).toLowerCase();
      return inv.invoice_number.toLowerCase().includes(q)
        || customerName.includes(q)
        || (inv.project_description || "").toLowerCase().includes(q)
        || String(inv.total).includes(q);
    })
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date) || b.invoice_number.localeCompare(a.invoice_number));

  const customerFilterName = customerFilter ? getCustomerName(customerFilter) : "";

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("invoices.title")}</h1>
        <div className="flex gap-2">
          {templates.length > 0 && !isReadOnly && (
            <button onClick={() => setShowTemplateModal(true)} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">{t("invoices.fromTemplate")}</button>
          )}
          {isReadOnly ? (
            <span title={READ_ONLY_TITLE} className="bg-[var(--accent)]/40 text-black/60 px-4 py-2 rounded-lg text-sm font-semibold cursor-not-allowed">{t("invoices.new")}</span>
          ) : (
            <Link href="/invoices/new" className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">{t("invoices.new")}</Link>
          )}
        </div>
      </div>

      {customerFilter && (
        <div className="mb-3 inline-flex items-center gap-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm">
          <span className="text-[var(--text-muted)]">{t("invoices.filteredByCustomer")}:</span>
          <span className="font-medium text-[var(--text-primary)]">{customerFilterName || customerFilter}</span>
          <button
            onClick={() => router.push("/invoices")}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-base leading-none"
            aria-label={t("common.cancel")}
          >&times;</button>
        </div>
      )}

      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition ${
                activeFilter === tab.value
                  ? "bg-[var(--accent)] text-black"
                  : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="sm:ml-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("invoices.search")}
            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-full sm:w-56"
          />
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("invoices.numberShort")}</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("invoices.customer")}</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("invoices.date")}</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">{t("invoices.gross")}</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">{t("common.vat")}</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">{t("invoices.paid")}</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("invoices.created")}</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-[var(--text-muted)] uppercase">DE/EN</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("common.status")}</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {invoices.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--text-muted)]">{t("invoices.noInvoices")}</td></tr>
            )}
            {filteredInvoices.map((inv) => {
              const isStorniert = inv.status === "storniert";
              const isPaid = inv.status === "bezahlt";
              const isPartial = inv.status === "teilbezahlt";
              const isEN = inv.language === "en";
              const isLoadingPdf = pdfLoading === inv.id;
              const overdue = isOverdue(inv);

              return (
                <tr key={inv.id} className={`hover:bg-[var(--surface-hover)] transition cursor-pointer ${isStorniert ? "opacity-50" : ""}`} onClick={() => router.push(`/invoices/${inv.id}`)}>
                  <td className="px-3 py-3">
                    <div className="font-medium text-[var(--text-primary)] text-sm flex items-center gap-1.5">{inv.invoice_number}{inv.e_invoice_format && inv.e_invoice_format !== "none" && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">{inv.e_invoice_format === "zugferd" ? "ZUGFeRD" : "XR"}</span>}</div>
                    {inv.project_description && <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[140px]">{inv.project_description}</div>}
                  </td>
                  <td className="px-3 py-3 text-sm text-[var(--text-secondary)] max-w-[120px] truncate">{getCustomerName(inv.customer_id)}</td>
                  <td className="px-3 py-3 text-sm text-[var(--text-secondary)]">{formatDateLong(inv.invoice_date)}</td>
                  <td className="px-3 py-3 text-right">
                    <div className={`text-sm font-medium ${overdue ? "text-rose-400" : "text-[var(--text-primary)]"}`}>{formatCurrency(inv.total)}</div>
                    {overdue && <div className="text-[10px] text-rose-400 font-medium">{t("invoices.overdue")}</div>}
                  </td>
                  <td className="px-3 py-3 text-sm text-right text-orange-400">{formatCurrency(inv.tax_amount)}</td>
                  <td className="px-3 py-3 text-sm text-right">
                    {(isPaid || isPartial) ? (
                      <span className={isPaid ? "text-emerald-400" : "text-cyan-400"}>{formatCurrency(inv.paid_amount)}</span>
                    ) : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--text-muted)] max-w-[60px] truncate">{inv.created_by || "—"}</td>
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleLanguageToggle(inv.id, inv.language)}
                      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${isEN ? "bg-[var(--accent)]" : "bg-gray-600"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isEN ? "translate-x-5" : "translate-x-1"}`} />
                      <span className={`absolute text-[8px] font-bold ${isEN ? "left-1" : "right-1"} text-[var(--text-primary)]`}>{isEN ? "EN" : "DE"}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {isStorniert ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/15 text-purple-400">{t("invoiceStatus.storniert")}</span>
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
                        {overdue && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40">{t("invoiceStatus.ueberfaellig")}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => handleDirectPreview(inv)}
                        disabled={isLoadingPdf}
                        className="text-[var(--accent)] hover:brightness-110 p-1 disabled:opacity-50"
                        title="Vorschau"
                      >
                        {isLoadingPdf ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" /></svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleDirectDownload(inv)}
                        disabled={isLoadingPdf}
                        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] p-1 disabled:opacity-50"
                        title="PDF Download"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleEInvoiceDirect(inv)}
                        disabled={eInvoiceLoading === inv.id || isStorniert}
                        className="text-emerald-500 hover:text-emerald-400 p-1 disabled:opacity-50"
                        title={inv.e_invoice_format && inv.e_invoice_format !== "none"
                          ? `E-Rechnung (${inv.e_invoice_format === "zugferd" ? "ZUGFeRD" : "XRechnung"}) herunterladen`
                          : "E-Rechnung erstellen"}
                      >
                        {eInvoiceLoading === inv.id ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" /></svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <path d="M9 13h6" /><path d="M9 17h3" />
                          </svg>
                        )}
                      </button>
                      {!isStorniert && (
                        <button onClick={() => handleCancel(inv.id)} className="text-rose-500/60 hover:text-rose-400 p-1" title={t("invoices.cancelInvoice")}>
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

      <PDFPreviewModal blob={previewBlob} onClose={() => setPreviewBlob(null)} />

      {eInvoiceError && (
        <div className="fixed bottom-6 right-6 max-w-md bg-rose-950 border border-rose-500/40 rounded-lg px-4 py-3 shadow-xl z-50">
          <div className="flex justify-between items-start gap-3">
            <pre className="text-xs text-rose-200 whitespace-pre-wrap">{eInvoiceError}</pre>
            <button onClick={() => setEInvoiceError(null)} className="text-rose-300 hover:text-rose-100">×</button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPaymentModal(null)}>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("invoices.recordPayment")}</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-1">Rechnung: <span className="text-[var(--text-primary)] font-medium">{paymentModal.invoice.invoice_number}</span></p>
            <p className="text-sm text-[var(--text-secondary)] mb-4">{t("invoices.gross")}: <span className="text-[var(--text-primary)] font-medium">{formatCurrency(paymentModal.invoice.total)}</span></p>

            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("invoices.paidAmount")}</label>
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              step="0.01"
              min={0}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] mb-3 no-spinners"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") submitPayment(); }}
            />

            {Number(paymentAmount) > 0 && Number(paymentAmount) < paymentModal.invoice.total && (
              <p className="text-xs text-cyan-400 mb-3">{t("invoices.partialPayment")} {formatCurrency(paymentModal.invoice.total - Number(paymentAmount))}</p>
            )}
            {Number(paymentAmount) >= paymentModal.invoice.total && (
              <p className="text-xs text-emerald-400 mb-3">{t("invoices.fullyPaid")}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentAmount(String(paymentModal.invoice.total))}
                className="bg-emerald-500/15 text-emerald-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500/25 transition"
              >
                {t("invoices.fullAmount")}
              </button>
              <button
                type="button"
                onClick={submitPayment}
                className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
              >
                {t("invoices.recordPayment")}
              </button>
              <button
                type="button"
                onClick={() => setPaymentModal(null)}
                className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("invoices.invoiceFromTemplate")}</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {templates.map((tpl) => (
                <Link
                  key={tpl.id}
                  href={`/invoices/new?template=${tpl.id}`}
                  className="block bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 hover:bg-[var(--surface-hover)] transition"
                >
                  <p className="font-medium text-[var(--text-primary)] text-sm">{tpl.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{tpl.items.length} Positionen — {tpl.project_description || "Keine Projektbeschreibung"}</p>
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
