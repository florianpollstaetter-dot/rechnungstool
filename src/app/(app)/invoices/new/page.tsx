"use client";

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Customer, InvoiceItem, Product, UNIT_OPTIONS, Language } from "@/lib/types";
import { getCustomers, getSettings, getActiveProducts, createInvoice, getTemplate, getCurrentUserName, getUserAccompanyingText } from "@/lib/db";
import { useAutosave } from "@/lib/use-autosave";
import { addDays, formatCurrency } from "@/lib/format";
import { calcItemTotal, calcTotals } from "@/lib/calc";

type ItemRow = Omit<InvoiceItem, "id">;

function emptyItem(pos: number): ItemRow {
  return { position: pos, description: "", unit: "Stueck", product_id: null, quantity: 1, unit_price: 0, discount_percent: 0, discount_amount: 0, total: 0 };
}

export default function NewInvoicePageWrapper() {
  return <Suspense fallback={<div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>}><NewInvoicePage /></Suspense>;
}

function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split("T")[0]);
  const [taxRate, setTaxRate] = useState(20);
  const [paymentTermsDays, setPaymentTermsDays] = useState(14);
  const [notes, setNotes] = useState("");
  const [language, setLanguage] = useState<Language>("de");
  const [items, setItems] = useState<ItemRow[]>([emptyItem(1)]);
  const [overallDiscountPercent, setOverallDiscountPercent] = useState(0);
  const [overallDiscountAmount, setOverallDiscountAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Auto-save form data
  const formData = useMemo(() => ({
    customerId, projectDescription, invoiceDate, deliveryDate, taxRate,
    paymentTermsDays, notes, language, items, overallDiscountPercent, overallDiscountAmount,
  }), [customerId, projectDescription, invoiceDate, deliveryDate, taxRate, paymentTermsDays, notes, language, items, overallDiscountPercent, overallDiscountAmount]);

  const { clearDraft } = useAutosave("new-invoice", formData, (saved) => {
    if (saved.customerId) setCustomerId(saved.customerId);
    if (saved.projectDescription) setProjectDescription(saved.projectDescription);
    if (saved.invoiceDate) setInvoiceDate(saved.invoiceDate);
    if (saved.deliveryDate) setDeliveryDate(saved.deliveryDate);
    if (saved.taxRate) setTaxRate(saved.taxRate);
    if (saved.paymentTermsDays) setPaymentTermsDays(saved.paymentTermsDays);
    if (saved.notes) setNotes(saved.notes);
    if (saved.language) setLanguage(saved.language);
    if (saved.items?.length) setItems(saved.items);
    if (saved.overallDiscountPercent) setOverallDiscountPercent(saved.overallDiscountPercent);
    if (saved.overallDiscountAmount) setOverallDiscountAmount(saved.overallDiscountAmount);
  });

  const loadData = useCallback(async () => {
    const [cust, settings, prods] = await Promise.all([getCustomers(), getSettings(), getActiveProducts()]);
    setCustomers(cust);
    setProducts(prods);
    setTaxRate(settings.default_tax_rate);
    setPaymentTermsDays(settings.default_payment_terms_days);

    // Load template if ?template=ID is present
    const templateId = searchParams.get("template");
    if (templateId) {
      const tpl = await getTemplate(templateId);
      if (tpl) {
        setProjectDescription(tpl.project_description);
        setNotes(tpl.notes);
        setLanguage(tpl.language);
        setTaxRate(tpl.tax_rate);
        setOverallDiscountPercent(tpl.overall_discount_percent);
        setOverallDiscountAmount(tpl.overall_discount_amount);
        if (tpl.customer_id) setCustomerId(tpl.customer_id);
        if (tpl.items.length > 0) {
          setItems(tpl.items.map((i) => ({
            ...i,
            total: (i.quantity * i.unit_price) - (i.discount_percent > 0 ? i.quantity * i.unit_price * i.discount_percent / 100 : i.discount_amount),
          })));
        }
      }
    }
  }, [searchParams]);

  useEffect(() => { loadData(); }, [loadData]);

  function updateItem(index: number, field: string, value: string | number | null) {
    const updated = [...items];
    (updated[index] as Record<string, unknown>)[field] = value;
    if (field === "quantity" || field === "unit_price" || field === "discount_percent" || field === "discount_amount") {
      updated[index].total = calcItemTotal(updated[index]);
    }
    setItems(updated);
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (product) {
      const updated = [...items];
      updated[index] = {
        ...updated[index],
        product_id: product.id,
        description: product.name,
        unit: product.unit,
        unit_price: product.unit_price,
        total: calcItemTotal({ ...updated[index], unit_price: product.unit_price }),
      };
      setItems(updated);
    }
  }

  function addItem() {
    setItems([...items, emptyItem(items.length + 1)]);
  }

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index);
    updated.forEach((item, i) => (item.position = i + 1));
    setItems(updated);
  }

  const { subtotal, taxAmount, total } = calcTotals(items, taxRate, overallDiscountPercent, overallDiscountAmount);
  const dueDate = addDays(invoiceDate, paymentTermsDays);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createInvoice({
        customer_id: customerId,
        project_description: projectDescription,
        invoice_date: invoiceDate,
        delivery_date: deliveryDate,
        due_date: dueDate,
        items: items.map((item) => ({ ...item, id: crypto.randomUUID(), total: calcItemTotal(item) })),
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        overall_discount_percent: overallDiscountPercent,
        overall_discount_amount: overallDiscountAmount,
        status: "offen",
        paid_at: null,
        paid_amount: 0,
        notes,
        language,
        accompanying_text: await getUserAccompanyingText(language),
        created_by: getCurrentUserName() || null,
      });
      clearDraft();
      router.push("/invoices");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Neue Rechnung</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold mb-4">Rechnungsdetails</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Kunde *</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent">
                <option value="">Kunde waehlen...</option>
                {customers.map((c) => (<option key={c.id} value={c.id}>{c.company || c.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Leistungsbeschreibung / Projekt</label>
              <input type="text" value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" placeholder="z.B. Apple Vision Pro App Leihstellungen inkl Personal" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Rechnungsdatum</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Leistungsdatum</label>
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">MwSt-Satz (%)</label>
              <input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Sprache</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent">
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Fällig am</label>
              <input type="text" value={dueDate} readOnly className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--background)] text-gray-500" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Positionen</h2>
            <button type="button" onClick={addItem} className="text-sm text-[var(--accent)] hover:brightness-110 font-medium">+ Position hinzufuegen</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-12">Pos</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-36">Produkt</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">Leistung</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-28">Einheit</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-20">Menge</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">Einzelpreis</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-20">Rabatt %</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">Betrag</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-[var(--border)]">
                    <td className="py-2 text-sm text-gray-500">{item.position}</td>
                    <td className="py-2">
                      <select value={item.product_id || ""} onChange={(e) => e.target.value ? selectProduct(idx, e.target.value) : updateItem(idx, "product_id", null)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                        <option value="">hier auswaehlen</option>
                        {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                      </select>
                    </td>
                    <td className="py-2">
                      <input type="text" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" required placeholder="**Fett** für Hervorhebung" />
                    </td>
                    <td className="py-2">
                      <select value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                        {UNIT_OPTIONS.map((u) => (<option key={u.value} value={u.value}>{u.label}</option>))}
                      </select>
                    </td>
                    <td className="py-2">
                      <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateItem(idx, "quantity", v); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black" min={1} step="1" required />
                    </td>
                    <td className="py-2">
                      <input type="number" value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateItem(idx, "unit_price", v); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black no-spinners" step="0.01" min={0} required />
                    </td>
                    <td className="py-2">
                      <input type="number" value={item.discount_percent} onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))} onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateItem(idx, "discount_percent", v); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black no-spinners" step="0.01" min={0} max={100} />
                    </td>
                    <td className="py-2 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(calcItemTotal(item))}</td>
                    <td className="py-2 text-center">
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)} className="text-rose-400 hover:text-rose-300 text-sm">X</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="grid grid-cols-2 gap-4 max-w-md ml-auto">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Gesamtrabatt %</label>
                <input type="number" value={overallDiscountPercent} onChange={(e) => setOverallDiscountPercent(Number(e.target.value))} onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setOverallDiscountPercent(v); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black no-spinners" step="0.01" min={0} max={100} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Gesamtrabatt absolut</label>
                <input type="number" value={overallDiscountAmount} onChange={(e) => setOverallDiscountAmount(Number(e.target.value))} onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setOverallDiscountAmount(v); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black no-spinners" step="0.01" min={0} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-end space-y-1 text-sm">
            <div className="flex justify-between w-full sm:w-64">
              <span className="text-gray-400">Summe netto</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between w-full sm:w-64">
              <span className="text-gray-400">Umsatzsteuer {taxRate}%</span>
              <span className="font-medium">{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between w-full sm:w-64 text-base font-bold border-t border-[var(--border)] pt-1">
              <span>BRUTTO</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <label className="block text-sm font-medium text-gray-400 mb-1">Anmerkungen</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" rows={3} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
            {submitting ? "Wird erstellt..." : "Rechnung erstellen"}
          </button>
          <button type="button" onClick={() => router.push("/invoices")} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
