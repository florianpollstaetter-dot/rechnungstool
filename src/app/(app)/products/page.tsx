"use client";

import { useState, useEffect, useCallback } from "react";
import { Product, UNIT_OPTIONS, UnitType, CompanyRole } from "@/lib/types";
import { getProducts, createProduct, updateProduct, deleteProduct, getCompanyRoles } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n-context";

export default function ProductsPage() {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    name_en: "",
    description_en: "",
    unit: "Stueck" as UnitType,
    unit_price: "" as string | number,
    tax_rate: 20,
    active: true,
    role_id: "" as string,
  });

  const loadData = useCallback(async () => {
    const [data, rolesData] = await Promise.all([getProducts(), getCompanyRoles()]);
    setProducts(data);
    setRoles(rolesData);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function resetForm() {
    setForm({ name: "", description: "", name_en: "", description_en: "", unit: "Stueck", unit_price: "", tax_rate: 20, active: true, role_id: "" });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(product: Product) {
    setForm({
      name: product.name,
      description: product.description,
      name_en: product.name_en,
      description_en: product.description_en,
      unit: product.unit,
      unit_price: product.unit_price,
      tax_rate: product.tax_rate,
      active: product.active,
      role_id: product.role_id || "",
    });
    setEditingId(product.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = { ...form, unit_price: Number(form.unit_price) || 0, role_id: form.role_id || null };
    if (editingId) {
      await updateProduct(editingId, data);
    } else {
      await createProduct(data);
    }
    resetForm();
    await loadData();
  }

  async function handleDelete(id: string) {
    if (confirm(t("products.confirmDelete"))) {
      await deleteProduct(id);
      await loadData();
    }
  }

  async function handleToggleActive(product: Product) {
    await updateProduct(product.id, { active: !product.active });
    await loadData();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("products.title")}</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
        >
          {t("products.new")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            {editingId ? t("products.editProduct") : t("products.newProduct")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("products.nameDe")}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("products.nameEn")}</label>
              <input
                type="text"
                value={form.name_en}
                onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                placeholder="English product name"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("products.descriptionDe")}</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("products.descriptionEn")}</label>
              <input
                type="text"
                value={form.description_en}
                onChange={(e) => setForm({ ...form, description_en: e.target.value })}
                placeholder="English description"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("products.unit")}</label>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value as UnitType })}
                className={inputClass}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("products.pricePerUnit")}</label>
              <input
                type="number"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value === "" ? "" : Number(e.target.value) })}
                onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setForm((f) => ({ ...f, unit_price: v })); }}
                step="0.01"
                min={0}
                placeholder="0.00"
                className={inputClass + " no-spinners"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("common.vatRate")}</label>
              <input
                type="number"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">{t("products.role")}</label>
              <select
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                className={inputClass}
              >
                <option value="">{t("products.noRole")}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-400">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="rounded accent-[var(--accent)]"
                />
                {t("common.active")}
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
            >
              {editingId ? t("common.save") : t("common.create")}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.name")}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("products.nameEn")}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("products.unit")}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("products.pricePerUnit")}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("common.vat")}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("products.role")}</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t("common.status")}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  {t("products.noProducts")}
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className={`hover:bg-[var(--surface-hover)] transition ${!p.active ? "opacity-50" : ""}`}>
                <td className="px-6 py-4">
                  <div className="font-medium text-[var(--text-primary)]">{p.name}</div>
                  {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
                </td>
                <td className="px-6 py-4">
                  {p.name_en ? (
                    <>
                      <div className="text-sm text-[var(--text-secondary)]">{p.name_en}</div>
                      {p.description_en && <div className="text-xs text-gray-500">{p.description_en}</div>}
                    </>
                  ) : (
                    <span className="text-xs text-gray-600 italic">{t("products.notSet")}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  {UNIT_OPTIONS.find((u) => u.value === p.unit)?.label || p.unit}
                </td>
                <td className="px-6 py-4 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(p.unit_price)}</td>
                <td className="px-6 py-4 text-sm text-right text-gray-400">{p.tax_rate}%</td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  {p.role_id ? (() => { const role = roles.find((r) => r.id === p.role_id); return role ? (<span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: (role.color || "#6b7280") + "20", color: role.color || "#6b7280" }}>{role.name}</span>) : "—"; })() : "—"}
                </td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => handleToggleActive(p)}
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      p.active ? "bg-emerald-500/15 text-emerald-400" : "bg-gray-500/15 text-gray-500"
                    }`}
                  >
                    {p.active ? t("common.active") : t("common.inactive")}
                  </button>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => startEdit(p)}
                    className="text-sm text-[var(--accent)] hover:brightness-110 mr-3"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-sm text-rose-400 hover:text-rose-300"
                  >
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
