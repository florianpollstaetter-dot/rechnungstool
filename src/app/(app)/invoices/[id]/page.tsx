"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Invoice, Customer, CompanySettings, InvoiceStatus, UNIT_OPTIONS, TemplateItem } from "@/lib/types";
import { getInvoice, getCustomer, getSettings, updateInvoice, createTemplate } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import PDFDownloadButton from "@/components/PDFDownloadButton";
import PDFPreviewModal from "@/components/PDFPreviewModal";
import { useI18n } from "@/lib/i18n-context";

export default function InvoiceDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  const statusLabels: Record<string, { label: string; color: string }> = {
    entwurf: { label: t("invoiceStatus.entwurf"), color: "bg-gray-500/15 text-gray-400" },
    offen: { label: t("invoiceStatus.offen"), color: "bg-amber-500/15 text-amber-400" },
    teilbezahlt: { label: t("invoiceStatus.teilbezahlt"), color: "bg-cyan-500/15 text-cyan-400" },
    bezahlt: { label: t("invoiceStatus.bezahlt"), color: "bg-emerald-500/15 text-emerald-400" },
    überfällig: { label: t("invoiceStatus.ueberfaellig"), color: "bg-rose-500/15 text-rose-400" },
    storniert: { label: t("invoiceStatus.storniert"), color: "bg-purple-500/15 text-purple-400" },
  };

  const loadData = useCallback(async () => {
    const inv = await getInvoice(params.id as string);
    if (inv) {
      setInvoice(inv);
      const [cust, s] = await Promise.all([getCustomer(inv.customer_id), getSettings()]);
      if (cust) setCustomer(cust);
      setSettings(s);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;
  if (!invoice || !customer || !settings) return <div className="text-center py-12 text-gray-500">Rechnung nicht gefunden.</div>;

  const st = statusLabels[invoice.status] || statusLabels.offen;
  const isStorniert = invoice.status === "storniert";

  async function handleStatusChange(status: InvoiceStatus) {
    await updateInvoice(invoice!.id, { status, paid_at: status === "bezahlt" ? new Date().toISOString() : null });
    const updated = await getInvoice(invoice!.id);
    if (updated) setInvoice(updated);
  }

  function getUnitLabel(unit: string) {
    return UNIT_OPTIONS.find((u) => u.value === unit)?.label || unit;
  }

  async function handleSaveAsTemplate() {
    const name = prompt(`${t("invoiceDetail.templateName")}`, invoice!.project_description || invoice!.invoice_number);
    if (!name) return;
    const items: TemplateItem[] = invoice!.items.map((i) => ({
      position: i.position, description: i.description, unit: i.unit,
      product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price,
      discount_percent: i.discount_percent, discount_amount: i.discount_amount,
    }));
    await createTemplate({
      name, template_type: "invoice", customer_id: invoice!.customer_id,
      project_description: invoice!.project_description, items,
      tax_rate: invoice!.tax_rate, overall_discount_percent: invoice!.overall_discount_percent,
      overall_discount_amount: invoice!.overall_discount_amount,
      notes: invoice!.notes, language: invoice!.language,
    });
    alert("Vorlage gespeichert: " + name);
  }

  const hasDiscounts = invoice.items.some((i) => i.discount_percent > 0 || i.discount_amount > 0) ||
    invoice.overall_discount_percent > 0 || invoice.overall_discount_amount > 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/invoices" className="text-sm text-gray-500 hover:text-[var(--text-secondary)] transition">&larr; {t("invoiceDetail.backToInvoices")}</Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">{t("invoiceDetail.invoiceNumber", { number: invoice.invoice_number })}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            invoice.language === "en" ? "bg-blue-500/15 text-blue-400" : "bg-gray-500/15 text-gray-400"
          }`}>
            {invoice.language === "en" ? "EN" : "DE"}
          </span>
          {invoice.e_invoice_format && invoice.e_invoice_format !== "none" && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400">
              {invoice.e_invoice_format === "zugferd" ? "ZUGFeRD" : "XRechnung"}
            </span>
          )}
          {isStorniert ? (
            <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${st.color}`}>{st.label}</span>
          ) : (
            <select value={invoice.status} onChange={(e) => handleStatusChange(e.target.value as InvoiceStatus)} className={`text-sm font-medium px-3 py-1.5 rounded-full border-0 bg-transparent ${st.color}`}>
              <option value="entwurf">{t("invoiceStatus.entwurf")}</option>
              <option value="offen">{t("invoiceStatus.offen")}</option>
              <option value="bezahlt">{t("invoiceStatus.bezahlt")}</option>
              <option value="ueberfaellig">{t("invoiceStatus.ueberfaellig")}</option>
            </select>
          )}
          <button onClick={handleSaveAsTemplate} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition" title="Als Vorlage speichern">
            {t("invoiceDetail.template")}
          </button>
          <PDFDownloadButton invoice={invoice} customer={customer} settings={settings} onPreview={setPreviewBlob} />
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 mb-8">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t("invoiceDetail.customer")}</h3>
            <p className="font-medium text-[var(--text-primary)]">{customer.company || customer.name}</p>
            {customer.company && <p className="text-sm text-gray-400">{customer.name}</p>}
            <p className="text-sm text-gray-400">{customer.address}</p>
            <p className="text-sm text-gray-400">{customer.zip} {customer.city}</p>
            {customer.uid_number && <p className="text-sm text-gray-400">{customer.uid_number}</p>}
          </div>
          <div className="sm:text-right">
            <div className="mb-2"><span className="text-sm text-gray-500">{t("invoiceDetail.invoiceDate")} </span><span className="font-medium text-[var(--text-primary)]">{formatDateLong(invoice.invoice_date)}</span></div>
            <div className="mb-2"><span className="text-sm text-gray-500">{t("invoiceDetail.serviceDate")} </span><span className="font-medium text-[var(--text-primary)]">{formatDateLong(invoice.delivery_date)}</span></div>
            <div><span className="text-sm text-gray-500">{t("invoiceDetail.dueDate")} </span><span className="font-medium text-[var(--text-primary)]">{formatDateLong(invoice.due_date)}</span></div>
            {invoice.project_description && <div className="mt-4"><span className="text-sm text-gray-500">{t("invoiceDetail.project")} </span><span className="font-medium text-[var(--text-primary)]">{invoice.project_description}</span></div>}
          </div>
        </div>

        <div className="overflow-x-auto mb-6">
        <table className="min-w-full">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-12">{t("invoiceNew.pos")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">{t("invoiceDetail.service")}</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase py-2 w-24">{t("invoiceDetail.unit")}</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-20">{t("invoiceDetail.quantity")}</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">{t("invoiceDetail.unitPrice")}</th>
              {hasDiscounts && <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-20">{t("invoiceDetail.discount")}</th>}
              <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">{t("invoiceNew.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
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
                <td className="py-3 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="flex flex-col items-end space-y-1 text-sm">
          <div className="flex justify-between w-full max-w-72">
            <span className="text-gray-400">{t("invoiceDetail.netTotal")}</span>
            <span className="font-medium text-[var(--text-primary)]">{formatCurrency(invoice.subtotal)}</span>
          </div>
          {(invoice.overall_discount_percent > 0 || invoice.overall_discount_amount > 0) && (
            <div className="flex justify-between w-full max-w-72 text-amber-400">
              <span>{t("invoiceDetail.overallDiscount")}</span>
              <span>
                {invoice.overall_discount_percent > 0 && `${invoice.overall_discount_percent}%`}
                {invoice.overall_discount_amount > 0 && ` ${formatCurrency(-invoice.overall_discount_amount)}`}
              </span>
            </div>
          )}
          <div className="flex justify-between w-full max-w-72">
            <span className="text-gray-400">{t("invoiceDetail.vatAmount", { rate: String(invoice.tax_rate) })}</span>
            <span className="font-medium text-[var(--text-primary)]">{formatCurrency(invoice.tax_amount)}</span>
          </div>
          <div className="flex justify-between w-full max-w-72 text-base font-bold border-t border-[var(--border)] pt-2 mt-1">
            <span className="text-[var(--text-primary)]">{t("invoiceDetail.grossTotal")}</span>
            <span className="text-[var(--accent)]">{formatCurrency(invoice.total)}</span>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-6 pt-4 border-t border-[var(--border)]">
            <h3 className="text-sm font-medium text-gray-500 mb-1">{t("invoiceDetail.notes")}</h3>
            <p className="text-sm text-gray-400">{invoice.notes}</p>
          </div>
        )}
      </div>

      <PDFPreviewModal blob={previewBlob} onClose={() => setPreviewBlob(null)} />
    </div>
  );
}
