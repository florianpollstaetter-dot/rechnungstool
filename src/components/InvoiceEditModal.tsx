"use client";

import { useState } from "react";
import { Quote, InvoiceItem, UNIT_OPTIONS } from "@/lib/types";
import { calcItemTotal, calcTotals } from "@/lib/calc";
import { formatCurrency } from "@/lib/format";
import { createInvoice, updateQuote, getUserAccompanyingText } from "@/lib/db";
import { useI18n } from "@/lib/i18n-context";

type EditableItem = Omit<InvoiceItem, "id"> & { id?: string };

interface InvoiceEditModalProps {
  quote: Quote;
  mode: "full" | "partial";
  partialFactor?: number;
  partialLabel?: string;
  invoicedTotal?: number;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
}

function buildItemsFromQuote(quote: Quote, factor: number): EditableItem[] {
  return quote.items.map((item) => {
    const scaledUnitPrice = Math.round(item.unit_price * factor * 100) / 100;
    const scaledDiscountAmount = Math.round(item.discount_amount * factor * 100) / 100;
    return {
      position: item.position,
      description: item.description,
      unit: item.unit,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: scaledUnitPrice,
      discount_percent: item.discount_percent,
      discount_amount: scaledDiscountAmount,
      total: calcItemTotal({ quantity: item.quantity, unit_price: scaledUnitPrice, discount_percent: item.discount_percent, discount_amount: scaledDiscountAmount }),
    };
  });
}

export default function InvoiceEditModal({
  quote,
  mode,
  partialFactor = 1,
  partialLabel,
  invoicedTotal = 0,
  onClose,
  onCreated,
}: InvoiceEditModalProps) {
  const { t } = useI18n();
  const [items, setItems] = useState<EditableItem[]>(() => buildItemsFromQuote(quote, partialFactor));
  const [taxRate, setTaxRate] = useState(quote.tax_rate);
  const [overallDiscountPercent, setOverallDiscountPercent] = useState(quote.overall_discount_percent);
  const [overallDiscountAmount, setOverallDiscountAmount] = useState(
    Math.round(quote.overall_discount_amount * partialFactor * 100) / 100
  );
  const [notes, setNotes] = useState(
    mode === "partial" && partialLabel
      ? `Teilrechnung zu Angebot ${quote.quote_number} (${partialLabel})`
      : quote.notes || ""
  );
  const [projectDescription, setProjectDescription] = useState(
    mode === "partial" && partialLabel
      ? `${quote.project_description || quote.quote_number} — Teilrechnung ${partialLabel}`
      : quote.project_description || ""
  );
  const [submitting, setSubmitting] = useState(false);

  const totals = calcTotals(items, taxRate, overallDiscountPercent, overallDiscountAmount);

  const remainingQuoteTotal = quote.total - invoicedTotal;

  function updateItem(index: number, field: string, value: string | number | null) {
    const updated = [...items];
    (updated[index] as Record<string, unknown>)[field] = value;
    if (field === "quantity" || field === "unit_price" || field === "discount_percent" || field === "discount_amount") {
      updated[index].total = calcItemTotal(updated[index]);
    }
    setItems(updated);
  }

  function addItem() {
    setItems([...items, {
      position: items.length + 1,
      description: "",
      unit: "Stueck",
      product_id: null,
      quantity: 1,
      unit_price: 0,
      discount_percent: 0,
      discount_amount: 0,
      total: 0,
    }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    const updated = items.filter((_, i) => i !== index).map((item, i) => ({ ...item, position: i + 1 }));
    setItems(updated);
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const invoiceItems = items.map((item) => ({
        id: crypto.randomUUID(),
        position: item.position,
        description: item.description,
        unit: item.unit,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_percent: item.discount_percent,
        discount_amount: item.discount_amount,
        total: item.total,
      }));

      const invoice = await createInvoice({
        customer_id: quote.customer_id,
        project_description: projectDescription,
        invoice_date: new Date().toISOString().split("T")[0],
        delivery_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
        items: invoiceItems,
        subtotal: totals.subtotal,
        tax_rate: taxRate,
        tax_amount: totals.taxAmount,
        total: totals.total,
        overall_discount_percent: overallDiscountPercent,
        overall_discount_amount: overallDiscountAmount,
        status: "offen",
        paid_at: null,
        paid_amount: 0,
        notes: `${notes}\n[source_quote:${quote.id}]`.trim(),
        language: quote.language || "de",
        accompanying_text: await getUserAccompanyingText(quote.language || "de"),
        e_invoice_format: "none",
        created_by: null,
      });

      if (mode === "full") {
        await updateQuote(quote.id, {
          status: "accepted",
          converted_invoice_id: invoice.id,
        });
      }

      onCreated(invoice.id);
    } catch (err) {
      console.error("Failed to create invoice:", err);
      alert(t("invoiceEdit.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-xl border border-[var(--border)] w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {mode === "partial" ? t("invoiceEdit.titlePartial") : t("invoiceEdit.titleFull")}
            </h2>
            <p className="text-sm text-gray-400">
              {t("invoiceEdit.fromQuote", { number: quote.quote_number })}
              {invoicedTotal > 0 && (
                <span className="ml-2 text-cyan-400">
                  ({t("invoiceEdit.alreadyInvoiced", { amount: formatCurrency(invoicedTotal) })} / {formatCurrency(quote.total)} — {t("invoiceEdit.remaining", { amount: formatCurrency(remainingQuoteTotal) })})
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[var(--text-secondary)] p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Project description */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t("invoiceEdit.projectDescription")}</label>
            <input
              type="text"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          {/* Line items */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-400">{t("invoiceEdit.positions")}</label>
              <button onClick={addItem} className="text-xs text-[var(--accent)] hover:brightness-110">+ {t("invoiceEdit.addPosition")}</button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-[var(--background)] rounded-lg p-3 border border-[var(--border)]">
                  <div className="col-span-1">
                    <label className="text-[10px] text-gray-500 uppercase">{t("invoiceEdit.pos")}</label>
                    <div className="text-sm text-gray-400 mt-1">{item.position}</div>
                  </div>
                  <div className="col-span-4">
                    <label className="text-[10px] text-gray-500 uppercase">{t("invoiceEdit.description")}</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                      className="w-full bg-transparent border-b border-[var(--border)] text-sm text-[var(--text-primary)] py-1 focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] text-gray-500 uppercase">{t("invoiceEdit.unit")}</label>
                    <select
                      value={item.unit}
                      onChange={(e) => updateItem(idx, "unit", e.target.value)}
                      className="w-full bg-transparent border-b border-[var(--border)] text-sm text-[var(--text-primary)] py-1 focus:outline-none"
                    >
                      {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] text-gray-500 uppercase">{t("invoiceEdit.qty")}</label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                      min={0}
                      step="0.01"
                      className="w-full bg-transparent border-b border-[var(--border)] text-sm text-[var(--text-primary)] py-1 focus:outline-none focus:border-[var(--accent)] no-spinners text-right"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-gray-500 uppercase">{t("invoiceEdit.unitPrice")}</label>
                    <input
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                      min={0}
                      step="0.01"
                      className="w-full bg-transparent border-b border-[var(--border)] text-sm text-[var(--text-primary)] py-1 focus:outline-none focus:border-[var(--accent)] no-spinners text-right"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] text-gray-500 uppercase">{t("invoiceEdit.discount")}</label>
                    <input
                      type="number"
                      value={item.discount_percent}
                      onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))}
                      min={0}
                      max={100}
                      step="1"
                      className="w-full bg-transparent border-b border-[var(--border)] text-sm text-amber-400 py-1 focus:outline-none focus:border-[var(--accent)] no-spinners text-right"
                      placeholder="%"
                    />
                  </div>
                  <div className="col-span-1 text-right">
                    <label className="text-[10px] text-gray-500 uppercase">{t("invoiceEdit.total")}</label>
                    <div className="text-sm font-medium text-[var(--text-primary)] mt-1">{formatCurrency(item.total)}</div>
                  </div>
                  <div className="col-span-1 flex items-end justify-end pb-1">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-rose-500/60 hover:text-rose-400 p-0.5" title={t("common.delete")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tax rate + overall discount */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("invoiceEdit.taxRate")}</label>
              <input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                min={0}
                max={100}
                step="1"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] no-spinners"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("invoiceEdit.overallDiscountPercent")}</label>
              <input
                type="number"
                value={overallDiscountPercent}
                onChange={(e) => setOverallDiscountPercent(Number(e.target.value))}
                min={0}
                max={100}
                step="1"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-amber-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] no-spinners"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("invoiceEdit.overallDiscountAmount")}</label>
              <input
                type="number"
                value={overallDiscountAmount}
                onChange={(e) => setOverallDiscountAmount(Number(e.target.value))}
                min={0}
                step="0.01"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-amber-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] no-spinners"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t("invoiceEdit.notes")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
            />
          </div>
        </div>

        {/* Footer with totals + actions */}
        <div className="sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border)] px-6 py-4">
          <div className="flex justify-between items-end">
            <div className="space-y-1 text-sm">
              <div className="flex gap-8">
                <span className="text-gray-400">{t("invoiceEdit.netTotal")}</span>
                <span className="font-medium text-[var(--text-primary)]">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex gap-8">
                <span className="text-gray-400">{t("invoiceEdit.vat", { rate: taxRate })}</span>
                <span className="font-medium text-[var(--text-primary)]">{formatCurrency(totals.taxAmount)}</span>
              </div>
              <div className="flex gap-8 text-base font-bold border-t border-[var(--border)] pt-1">
                <span className="text-[var(--text-primary)]">{t("invoiceEdit.grossTotal")}</span>
                <span className="text-[var(--accent)]">{formatCurrency(totals.total)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || items.every((i) => i.total === 0)}
                className="bg-emerald-600 text-[var(--text-primary)] px-6 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-500 transition disabled:opacity-50"
              >
                {submitting ? t("invoiceEdit.creating") : t("invoiceEdit.createInvoice")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
