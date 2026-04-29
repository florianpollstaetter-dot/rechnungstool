"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Customer } from "@/lib/types";
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/db";
import { useI18n } from "@/lib/i18n-context";
import SevDeskImportModal from "@/components/SevDeskImportModal";
import AngeboteTabBar from "@/components/AngeboteTabBar";
import { customerEInvoiceReadiness } from "@/lib/einvoice/customer-ready";

const emptyCustomer = {
  name: "",
  company: "",
  address: "",
  city: "",
  zip: "",
  country: "Oesterreich",
  uid_number: "",
  leitweg_id: "",
  email: "",
  phone: "",
};

export default function CustomersPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState(emptyCustomer);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    confidence?: string;
    source?: string;
    cost_eur?: number;
  } | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);
  const [aiFilledKeys, setAiFilledKeys] = useState<Set<keyof typeof emptyCustomer>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    const data = await getCustomers();
    setCustomers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await updateCustomer(editing, form);
      } else {
        await createCustomer(form);
      }
      await loadCustomers();
      setForm(emptyCustomer);
      setEditing(null);
      setShowForm(false);
      setShowAllFields(false);
      setAiResult(null);
      setAiFilledKeys(new Set());
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : t("customers.saveError")
      );
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(customer: Customer) {
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
    setEditing(customer.id);
    setShowForm(true);
    setShowAllFields(true);
    setAiResult(null);
    setAiFilledKeys(new Set());
  }

  async function handleDelete(id: string) {
    if (confirm(t("customers.confirmDelete"))) {
      await deleteCustomer(id);
      await loadCustomers();
    }
  }

  async function handleAiComplete() {
    const searchName = form.company || form.name;
    if (!searchName.trim()) return;

    setAiLoading(true);
    setAiResult(null);

    try {
      const res = await fetch("/api/customers/ai-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: searchName.trim() }),
      });
      const data = await res.json();

      if (data.success && data.customer) {
        // Only fill fields that are currently empty; remember which ones the
        // AI actually touched so the UI can highlight them (SCH-579).
        const filled = new Set<keyof typeof emptyCustomer>();
        setForm((prev) => {
          const updated = { ...prev };
          const keys = Object.keys(data.customer) as (keyof typeof emptyCustomer)[];
          for (const key of keys) {
            if (!updated[key] && data.customer[key]) {
              updated[key] = data.customer[key];
              filled.add(key);
            }
          }
          return updated;
        });
        setAiFilledKeys(filled);
        setShowAllFields(true);
        setAiResult({
          confidence: data.confidence,
          source: data.source,
          cost_eur: data.cost?.cost_eur,
        });
      } else {
        setAiResult({ confidence: "error", source: data.error || t("customers.aiError") });
      }
    } catch {
      setAiResult({ confidence: "error", source: t("customers.aiNetworkError") });
    } finally {
      setAiLoading(false);
    }
  }

  const fields: { key: keyof typeof emptyCustomer; label: string }[] = [
    { key: "name", label: t("common.name") },
    { key: "company", label: t("customers.company") },
    { key: "address", label: t("common.address") },
    { key: "zip", label: t("common.zip") },
    { key: "city", label: t("common.city") },
    { key: "country", label: t("common.country") },
    { key: "uid_number", label: t("customers.uidNumber") },
    { key: "leitweg_id", label: t("customers.leitwegId") },
    { key: "email", label: t("common.email") },
    { key: "phone", label: t("common.phone") },
  ];

  // When creating new: show only name/company initially
  const isNewCustomer = !editing;
  const visibleFields =
    isNewCustomer && !showAllFields
      ? fields.filter((f) => f.key === "name" || f.key === "company")
      : fields;

  // SCH-579 — offer the AI button whenever at least one field is empty.
  // Hides on a fully-filled record so we don't waste Claude calls.
  const hasEmptyFields = fields.some((f) => !form[f.key]?.toString().trim());
  const canSearchAi = (form.name.trim() || form.company.trim()).length > 0;

  // Locale-aware so ä/ö/ü sort under a/o/u in DE etc., not as ASCII outliers.
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const sq = searchQuery.trim().toLowerCase();
  const visibleCustomers = customers
    .filter((c) => {
      if (!sq) return true;
      return (
        c.name.toLowerCase().includes(sq) ||
        c.company.toLowerCase().includes(sq) ||
        (c.uid_number || "").toLowerCase().includes(sq) ||
        (c.email || "").toLowerCase().includes(sq) ||
        (c.phone || "").toLowerCase().includes(sq)
      );
    })
    .sort((a, b) => collator.compare(a.company || a.name, b.company || b.name));

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div>
      <AngeboteTabBar />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("customers.title")}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="bg-[var(--surface-hover)] text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--border)] transition border border-[var(--border)]"
          >
            {t("sevdesk.importButton")}
          </button>
          <button
            onClick={() => {
              setForm(emptyCustomer);
              setEditing(null);
              setShowForm(true);
              setShowAllFields(false);
              setAiResult(null);
            }}
            className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
          >
            {t("customers.new")}
          </button>
        </div>
      </div>

      {showImport && (
        <SevDeskImportModal
          kind="customers"
          onClose={() => setShowImport(false)}
          onImported={() => loadCustomers()}
        />
      )}

      {showForm && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            {editing ? t("customers.editCustomer") : t("customers.newCustomer")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleFields.map((f) => {
              const aiFilled = aiFilledKeys.has(f.key);
              return (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-1.5">
                    {f.label}
                    {aiFilled && (
                      <span className="text-[10px] font-semibold text-purple-400 bg-purple-500/15 px-1.5 py-0.5 rounded">
                        {t("customers.aiSuggested")}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={form[f.key]}
                    onChange={(e) => {
                      setForm({ ...form, [f.key]: e.target.value });
                      // User touched an AI-filled field — clear the highlight
                      // so the badge doesn't lie about where the value came from.
                      if (aiFilled) {
                        setAiFilledKeys((prev) => {
                          const next = new Set(prev);
                          next.delete(f.key);
                          return next;
                        });
                      }
                    }}
                    className={`w-full bg-[var(--background)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent border ${
                      aiFilled ? "border-purple-500/60" : "border-[var(--border)]"
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* AI completion — always available when at least name/company set and
              some field is empty. New-customer mode also keeps the "fill manually"
              shortcut for skipping research. */}
          {(hasEmptyFields || isNewCustomer) && (
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleAiComplete}
                disabled={aiLoading || !canSearchAi}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {aiLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {t("customers.researching")}
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                      />
                    </svg>
                    {t("customers.aiCompletion")}
                  </>
                )}
              </button>
              {isNewCustomer && !showAllFields && (
                <button
                  onClick={() => setShowAllFields(true)}
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition underline underline-offset-2"
                >
                  {t("customers.fillManually")}
                </button>
              )}
            </div>
          )}

          {/* AI result feedback */}
          {aiResult && (
            <div
              className={`mt-3 px-3 py-2 rounded-lg text-sm ${
                aiResult.confidence === "error"
                  ? "bg-rose-500/10 text-rose-400"
                  : aiResult.confidence === "high"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : aiResult.confidence === "medium"
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-gray-500/10 text-gray-400"
              }`}
            >
              {aiResult.confidence === "error" ? (
                aiResult.source
              ) : (
                <>
                  {t("customers.aiCompleted")}
                  {aiResult.confidence && (
                    <span className="ml-2">
                      ({t("customers.aiConfidence")}:{" "}
                      {aiResult.confidence === "high"
                        ? t("customers.aiConfidenceHigh")
                        : aiResult.confidence === "medium"
                        ? t("customers.aiConfidenceMedium")
                        : t("customers.aiConfidenceLow")}
                      )
                    </span>
                  )}
                  {aiResult.source && (
                    <span className="ml-2 opacity-75">— {t("customers.aiSource")}: {aiResult.source}</span>
                  )}
                  {aiResult.cost_eur != null && (
                    <span className="ml-2 opacity-50">
                      ({aiResult.cost_eur.toFixed(4)} EUR)
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {saveError && (
            <div className="mt-3 px-3 py-2 rounded-lg text-sm bg-rose-500/10 text-rose-400">
              {saveError}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setShowAllFields(false);
                setAiResult(null);
                setAiFilledKeys(new Set());
                setSaveError(null);
              }}
              className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("customers.search")}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-full sm:w-80"
        />
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {t("customers.company")} / {t("common.name")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {t("common.address")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {t("customers.uidNumber")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {t("common.email")}
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase" title={t("customers.eInvoiceReadyHeaderTitle")}>
                {t("customers.eInvoiceReadyHeader")}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                {t("common.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {visibleCustomers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  {t("customers.noCustomers")}
                </td>
              </tr>
            )}
            {visibleCustomers.map((c) => {
              const readiness = customerEInvoiceReadiness(c);
              return (
                <tr key={c.id} className="hover:bg-[var(--surface-hover)] transition cursor-pointer" onClick={(e) => { if ((e.target as HTMLElement).closest('button, a, input, select')) return; router.push(`/customers/${c.id}`); }}>
                  <td className="px-6 py-4">
                    <div className="font-medium text-[var(--text-primary)]">
                      {c.company || c.name}
                    </div>
                    {c.company && (
                      <div className="text-sm text-gray-500">{c.name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {c.address}, {c.zip} {c.city}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {c.uid_number}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {c.email}
                    {c.phone && <div>{c.phone}</div>}
                  </td>
                  <td className="px-3 py-4 text-center">
                    {readiness.ready ? (
                      <span
                        title={t("customers.eInvoiceReadyTooltipOk")}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400"
                        aria-label={t("customers.eInvoiceReadyTooltipOk")}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                      </span>
                    ) : (
                      <span
                        title={`${t("customers.eInvoiceReadyTooltipMissing")}: ${readiness.missing.join(", ")}`}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/15 text-rose-400"
                        aria-label={`${t("customers.eInvoiceReadyTooltipMissing")}: ${readiness.missing.join(", ")}`}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => router.push(`/invoices?customerId=${c.id}`)}
                      className="text-sm text-[var(--accent)] hover:brightness-110 mr-3"
                    >
                      {t("customers.showInvoices")}
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-sm text-rose-400 hover:text-rose-300"
                    >
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
