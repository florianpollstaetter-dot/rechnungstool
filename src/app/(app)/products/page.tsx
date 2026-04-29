"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Product, UNIT_OPTIONS, UnitType, CompanyRole, ContentLocale, TranslationMap } from "@/lib/types";
import { getProducts, createProduct, updateProduct, deleteProduct, getCompanyRoles } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n-context";
import { CONTENT_LOCALES } from "@/lib/i18n-content";
import SevDeskImportModal from "@/components/SevDeskImportModal";
import AngeboteTabBar from "@/components/AngeboteTabBar";

// SCH-447 — Extra locales beyond the first-class de/en inputs. Rendered in a collapsible panel.
const EXTRA_LOCALES: ContentLocale[] = ["fr", "es", "it", "tr", "pl", "ar"];

export default function ProductsPage() {
  const { t, locale } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
  // SCH-447 — translation overrides for fr/es/it/tr/pl/ar. de/en live in the legacy form fields.
  const [nameTranslations, setNameTranslations] = useState<TranslationMap>({});
  const [descriptionTranslations, setDescriptionTranslations] = useState<TranslationMap>({});
  const [showTranslationsPanel, setShowTranslationsPanel] = useState(false);
  const [translatingLocale, setTranslatingLocale] = useState<ContentLocale | "all" | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);
  // SCH-929 P1.2 — board reported "Bearbeiten button doesn't work". The form
  // renders above the product table so a click on a row far down the list
  // appeared to do nothing. Scroll the form into view on edit.
  const formRef = useRef<HTMLFormElement | null>(null);

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
    setNameTranslations({});
    setDescriptionTranslations({});
    setShowTranslationsPanel(false);
    setTranslateError(null);
    setTranslatingLocale(null);
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
    // SCH-447 — preload only extra-locale overrides; de/en live in legacy fields.
    const extras = (src: TranslationMap | undefined): TranslationMap => {
      if (!src) return {};
      const out: TranslationMap = {};
      for (const loc of EXTRA_LOCALES) {
        if (src[loc]) out[loc] = src[loc];
      }
      return out;
    };
    setNameTranslations(extras(product.name_translations));
    setDescriptionTranslations(extras(product.description_translations));
    setShowTranslationsPanel(
      EXTRA_LOCALES.some((loc) => (product.name_translations?.[loc] ?? "") !== "" || (product.description_translations?.[loc] ?? "") !== ""),
    );
    setTranslateError(null);
    setEditingId(product.id);
    setShowForm(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function buildTranslationsFromForm() {
    const nameMap: TranslationMap = {};
    const descMap: TranslationMap = {};
    if (form.name) nameMap.de = form.name;
    if (form.name_en) nameMap.en = form.name_en;
    if (form.description) descMap.de = form.description;
    if (form.description_en) descMap.en = form.description_en;
    for (const loc of EXTRA_LOCALES) {
      const n = nameTranslations[loc]?.trim();
      const d = descriptionTranslations[loc]?.trim();
      if (n) nameMap[loc] = n;
      if (d) descMap[loc] = d;
    }
    return { nameMap, descMap };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { nameMap, descMap } = buildTranslationsFromForm();
    const data = {
      ...form,
      unit_price: Number(form.unit_price) || 0,
      role_id: form.role_id || null,
      name_translations: nameMap,
      description_translations: descMap,
    };
    if (editingId) {
      await updateProduct(editingId, data);
    } else {
      await createProduct(data);
    }
    resetForm();
    await loadData();
  }

  // SCH-447 — AI-translate helper. Uses DE name/description as source; falls back to EN if DE is empty.
  async function runAiTranslate(targets: ContentLocale[]) {
    const hasSource = form.name || form.description || form.name_en || form.description_en;
    if (!hasSource) {
      setTranslateError(t("products.translateNeedsSource"));
      return;
    }
    setTranslateError(null);
    setTranslatingLocale(targets.length === 1 ? targets[0] : "all");
    try {
      const sourceLocale: ContentLocale = form.name || form.description ? "de" : "en";
      const sourceName = sourceLocale === "de" ? form.name : form.name_en;
      const sourceDescription = sourceLocale === "de" ? form.description : form.description_en;
      const filteredTargets = targets.filter((l) => l !== sourceLocale);
      if (filteredTargets.length === 0) return;

      const calls: Promise<void>[] = [];

      if (sourceName) {
        calls.push(
          fetch("/api/translate-content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: sourceName,
              sourceLocale,
              targetLocales: filteredTargets,
              kind: "short",
            }),
          })
            .then((r) => r.json())
            .then((j: { translations?: Record<string, string>; error?: string }) => {
              if (j.error) throw new Error(j.error);
              if (j.translations) {
                setNameTranslations((prev) => ({ ...prev, ...(j.translations as TranslationMap) }));
              }
            }),
        );
      }

      if (sourceDescription) {
        calls.push(
          fetch("/api/translate-content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: sourceDescription,
              sourceLocale,
              targetLocales: filteredTargets,
              kind: "long",
            }),
          })
            .then((r) => r.json())
            .then((j: { translations?: Record<string, string>; error?: string }) => {
              if (j.error) throw new Error(j.error);
              if (j.translations) {
                setDescriptionTranslations((prev) => ({ ...prev, ...(j.translations as TranslationMap) }));
              }
            }),
        );
      }

      await Promise.all(calls);
      setShowTranslationsPanel(true);
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranslatingLocale(null);
    }
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

  // Locale-aware so ä/ö/ü sort under a/o/u in DE etc., not as ASCII outliers.
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const sq = searchQuery.trim().toLowerCase();
  const visibleProducts = products
    .filter((p) => {
      if (!sq) return true;
      if ((p.name || "").toLowerCase().includes(sq)) return true;
      if ((p.description || "").toLowerCase().includes(sq)) return true;
      if ((p.name_en || "").toLowerCase().includes(sq)) return true;
      if ((p.description_en || "").toLowerCase().includes(sq)) return true;
      const nameTr = p.name_translations || {};
      const descTr = p.description_translations || {};
      for (const v of Object.values(nameTr)) {
        if (v && v.toLowerCase().includes(sq)) return true;
      }
      for (const v of Object.values(descTr)) {
        if (v && v.toLowerCase().includes(sq)) return true;
      }
      return false;
    })
    .sort((a, b) => collator.compare(a.name || "", b.name || ""));

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
      <AngeboteTabBar />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("products.title")}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="bg-[var(--surface-hover)] text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--border)] transition border border-[var(--border)]"
          >
            {t("sevdesk.importButton")}
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
          >
            {t("products.new")}
          </button>
        </div>
      </div>

      {showImport && (
        <SevDeskImportModal
          kind="products"
          onClose={() => setShowImport(false)}
          onImported={() => loadData()}
        />
      )}

      {showForm && (
        <form ref={formRef} onSubmit={handleSubmit} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
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
          {/* SCH-447 — Translations panel: 6 extra UI languages + AI translate. */}
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setShowTranslationsPanel((s) => !s)}
                className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-2"
              >
                <span>{showTranslationsPanel ? "▾" : "▸"}</span>
                <span>{t("products.moreLanguages")}</span>
                <span className="text-xs text-gray-500">({EXTRA_LOCALES.length})</span>
              </button>
              <button
                type="button"
                onClick={() => runAiTranslate(EXTRA_LOCALES)}
                disabled={translatingLocale !== null}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)] disabled:opacity-50 transition"
              >
                {translatingLocale === "all" ? t("products.translating") : t("products.translateAll")}
              </button>
            </div>
            {translateError && (
              <div className="mt-2 text-xs text-rose-400">{translateError}</div>
            )}
            {showTranslationsPanel && (
              <div className="mt-3 space-y-3">
                {EXTRA_LOCALES.map((loc) => {
                  const meta = CONTENT_LOCALES.find((l) => l.code === loc);
                  return (
                    <div key={loc} className="rounded-lg border border-[var(--border)] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          <span className="mr-2">{meta?.flag}</span>
                          {meta?.label}
                          <span className="ml-2 text-xs text-gray-500 uppercase">{loc}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => runAiTranslate([loc])}
                          disabled={translatingLocale !== null}
                          className="text-xs font-medium px-2 py-1 rounded-md bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50 transition"
                        >
                          {translatingLocale === loc ? t("products.translating") : t("products.translateWithAi")}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={nameTranslations[loc] ?? ""}
                          onChange={(e) => setNameTranslations((prev) => ({ ...prev, [loc]: e.target.value }))}
                          placeholder={`${t("products.nameDe")} (${loc})`}
                          className={inputClass}
                          dir={loc === "ar" ? "rtl" : "ltr"}
                        />
                        <input
                          type="text"
                          value={descriptionTranslations[loc] ?? ""}
                          onChange={(e) => setDescriptionTranslations((prev) => ({ ...prev, [loc]: e.target.value }))}
                          placeholder={`${t("products.descriptionDe")} (${loc})`}
                          className={inputClass}
                          dir={loc === "ar" ? "rtl" : "ltr"}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("products.search")}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-full sm:w-80"
        />
      </div>

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
            {visibleProducts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  {t("products.noProducts")}
                </td>
              </tr>
            )}
            {visibleProducts.map((p) => (
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
