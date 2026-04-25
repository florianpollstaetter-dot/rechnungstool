"use client";

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Customer, QuoteItem, Product, UNIT_OPTIONS, Language, DisplayMode, CompanyRole, CompanySettings } from "@/lib/types";
import { getCustomers, getSettings, getActiveProducts, createQuote, getTemplate, getCompanyRoles } from "@/lib/db";
import { useAutosave } from "@/lib/use-autosave";
import { addDays, formatCurrency } from "@/lib/format";
import { calcItemTotal, calcTotals } from "@/lib/calc";
import { useI18n } from "@/lib/i18n-context";
import { useCompany } from "@/lib/company-context";
import QuoteNewSetupGate from "@/components/QuoteNewSetupGate";

type ItemRow = Omit<QuoteItem, "id">;

function emptyItem(pos: number): ItemRow {
  return { position: pos, description: "", unit: "Stueck", product_id: null, quantity: 1, unit_price: 0, discount_percent: 0, discount_amount: 0, total: 0, role_id: null };
}

export default function NewQuotePageWrapper() {
  const { t } = useI18n();
  return <Suspense fallback={<div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>}><NewQuotePage /></Suspense>;
}

function NewQuotePage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { company } = useCompany();
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split("T")[0]);
  const [validDays, setValidDays] = useState(30);
  const [taxRate, setTaxRate] = useState(20);
  const [language, setLanguage] = useState<Language>("de");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("detailed");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyItem(1)]);
  const [overallDiscountPercent, setOverallDiscountPercent] = useState(0);
  const [overallDiscountAmount, setOverallDiscountAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const formData = useMemo(() => ({
    customerId, projectDescription, quoteDate, validDays, taxRate, language, displayMode, notes, items, overallDiscountPercent, overallDiscountAmount,
  }), [customerId, projectDescription, quoteDate, validDays, taxRate, language, displayMode, notes, items, overallDiscountPercent, overallDiscountAmount]);

  const { clearDraft } = useAutosave("new-quote", formData, (saved) => {
    if (saved.customerId) setCustomerId(saved.customerId);
    if (saved.projectDescription) setProjectDescription(saved.projectDescription);
    if (saved.quoteDate) setQuoteDate(saved.quoteDate);
    if (saved.validDays) setValidDays(saved.validDays);
    if (saved.taxRate) setTaxRate(saved.taxRate);
    if (saved.language) setLanguage(saved.language);
    if (saved.displayMode) setDisplayMode(saved.displayMode);
    if (saved.notes) setNotes(saved.notes);
    if (saved.items?.length) setItems(saved.items);
    if (saved.overallDiscountPercent) setOverallDiscountPercent(saved.overallDiscountPercent);
    if (saved.overallDiscountAmount) setOverallDiscountAmount(saved.overallDiscountAmount);
  });

  const loadData = useCallback(async () => {
    const [cust, settings, prods, rolesData] = await Promise.all([getCustomers(), getSettings(), getActiveProducts(), getCompanyRoles()]);
    setCustomers(cust);
    setProducts(prods);
    setRoles(rolesData);
    setCompanySettings(settings);
    setTaxRate(settings.default_tax_rate);

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
    if (["quantity", "unit_price", "discount_percent", "discount_amount"].includes(field)) {
      updated[index].total = calcItemTotal(updated[index]);
    }
    setItems(updated);
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (product) {
      const updated = [...items];
      updated[index] = { ...updated[index], product_id: product.id, description: product.name, unit: product.unit, unit_price: product.unit_price, role_id: product.role_id || null, total: calcItemTotal({ ...updated[index], unit_price: product.unit_price }) };
      setItems(updated);
    }
  }

  function addItem() { setItems([...items, emptyItem(items.length + 1)]); }
  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index);
    updated.forEach((item, i) => (item.position = i + 1));
    setItems(updated);
  }

  const validUntil = addDays(quoteDate, validDays);
  const { subtotal, taxAmount, total } = calcTotals(items, taxRate, overallDiscountPercent, overallDiscountAmount);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createQuote({
        customer_id: customerId,
        project_description: projectDescription,
        quote_date: quoteDate,
        valid_until: validUntil,
        items: items.map((item) => ({ ...item, id: crypto.randomUUID(), total: calcItemTotal(item) })),
        subtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
        overall_discount_percent: overallDiscountPercent,
        overall_discount_amount: overallDiscountAmount,
        status: "draft",
        notes,
        language,
        display_mode: displayMode,
        converted_invoice_id: null,
        created_by: null,
      });
      clearDraft();
      router.push("/quotes");
    } finally { setSubmitting(false); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-6">{t("quoteNew.title")}</h1>
      <QuoteNewSetupGate settings={companySettings} companyId={company?.id ?? null}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold mb-4">{t("quoteNew.details")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("quoteNew.customer")}</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent">
                <option value="">{t("quoteNew.selectCustomer")}</option>
                {customers.map((c) => (<option key={c.id} value={c.id}>{c.company || c.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("quoteNew.projectDescription")}</label>
              <input type="text" value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("quoteNew.quoteDate")}</label>
              <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("quoteNew.validDays")}</label>
              <input type="number" value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} min={1} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("quoteNew.vatRate")}</label>
              <input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("quoteNew.validUntil")}</label>
              <input type="text" value={validUntil} readOnly className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("quoteNew.language")}</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent">
                <option value="de">{t("lang.de")}</option>
                <option value="en">{t("lang.en")}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("quoteNew.displayMode")}</label>
              <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value as DisplayMode)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent">
                <option value="detailed">{t("quoteNew.displayDetailed")}</option>
                <option value="simple">{t("quoteNew.displaySimple")}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">{t("quoteNew.items")}</h2>
            <button type="button" onClick={addItem} className="text-sm text-[var(--accent)] hover:brightness-110 font-medium">{t("quoteNew.addItem")}</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-12">{t("quoteNew.pos")}</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-36">{t("quoteNew.product")}</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">{t("quoteNew.service")}</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-28">{t("quoteNew.unit")}</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-20">{t("quoteNew.quantity")}</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">{t("quoteNew.unitPrice")}</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-20">{t("quoteNew.discountPercent")}</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-36">{t("quoteNew.role")}</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">{t("quoteNew.amount")}</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-[var(--border)]">
                    <td className="py-2 text-sm text-gray-500">{item.position}</td>
                    <td className="py-2">
                      <select value={item.product_id || ""} onChange={(e) => e.target.value ? selectProduct(idx, e.target.value) : updateItem(idx, "product_id", null)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                        <option value="">{t("quoteNew.selectProduct")}</option>
                        {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                      </select>
                    </td>
                    <td className="py-2"><input type="text" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" required /></td>
                    <td className="py-2">
                      <select value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                        {UNIT_OPTIONS.map((u) => (<option key={u.value} value={u.value}>{u.label}</option>))}
                      </select>
                    </td>
                    <td className="py-2"><input type="number" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateItem(idx, "quantity", v); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black" min={1} step="1" required /></td>
                    <td className="py-2"><input type="number" value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateItem(idx, "unit_price", v); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black no-spinners" step="0.01" min={0} required /></td>
                    <td className="py-2"><input type="number" value={item.discount_percent} onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))} onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateItem(idx, "discount_percent", v); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black no-spinners" step="0.01" min={0} max={100} /></td>
                    <td className="py-2">
                      <select value={item.role_id || ""} onChange={(e) => updateItem(idx, "role_id", e.target.value || null)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                        <option value="">{t("quoteNew.noRole")}</option>
                        {roles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                      </select>
                    </td>
                    <td className="py-2 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(calcItemTotal(item))}</td>
                    <td className="py-2 text-center">
                      {items.length > 1 && (<button type="button" onClick={() => removeItem(idx)} className="text-rose-400 hover:text-rose-300 text-sm">X</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="grid grid-cols-2 gap-4 max-w-md ml-auto">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("quoteNew.overallDiscountPercent")}</label>
                <input type="number" value={overallDiscountPercent} onChange={(e) => setOverallDiscountPercent(Number(e.target.value))} onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setOverallDiscountPercent(v); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black no-spinners" step="0.01" min={0} max={100} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("quoteNew.overallDiscountAmount")}</label>
                <input type="number" value={overallDiscountAmount} onChange={(e) => setOverallDiscountAmount(Number(e.target.value))} onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setOverallDiscountAmount(v); }} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-black no-spinners" step="0.01" min={0} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-end space-y-1 text-sm">
            <div className="flex justify-between w-full sm:w-64">
              <span className="text-gray-400">{t("quoteNew.netTotal")}</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between w-full sm:w-64">
              <span className="text-gray-400">{t("quoteNew.vatAmount", { rate: taxRate })}</span>
              <span className="font-medium">{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between w-full sm:w-64 text-base font-bold border-t border-[var(--border)] pt-1">
              <span>{t("quoteNew.grossTotal")}</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <label className="block text-sm font-medium text-gray-400 mb-1">{t("quoteNew.notes")}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent" rows={3} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
            {submitting ? t("quoteNew.submitting") : t("quoteNew.submit")}
          </button>
          <button type="button" onClick={() => router.push("/quotes")} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">{t("common.cancel")}</button>
        </div>
      </form>
      </QuoteNewSetupGate>
    </div>
  );
}
