"use client";

import { useState, useEffect, useCallback } from "react";
import { Customer } from "@/lib/types";
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/db";
import { useI18n } from "@/lib/i18n-context";

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
  const { t } = useI18n();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyCustomer);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    confidence?: string;
    source?: string;
    cost_eur?: number;
  } | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);

  const loadCustomers = useCallback(async () => {
    const data = await getCustomers();
    setCustomers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  async function handleSave() {
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
        // Only fill fields that are currently empty
        setForm((prev) => {
          const updated = { ...prev };
          const keys = Object.keys(data.customer) as (keyof typeof emptyCustomer)[];
          for (const key of keys) {
            if (!updated[key] && data.customer[key]) {
              updated[key] = data.customer[key];
            }
          }
          return updated;
        });
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("customers.title")}</h1>
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

      {showForm && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            {editing ? t("customers.editCustomer") : t("customers.newCustomer")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleFields.map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  {f.label}
                </label>
                <input
                  type="text"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                />
              </div>
            ))}
          </div>

          {/* AI completion + expand controls for new customers */}
          {isNewCustomer && !showAllFields && (
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleAiComplete}
                disabled={aiLoading || (!form.name.trim() && !form.company.trim())}
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
              <button
                onClick={() => setShowAllFields(true)}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition underline underline-offset-2"
              >
                {t("customers.fillManually")}
              </button>
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

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
            >
              {t("common.save")}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setShowAllFields(false);
                setAiResult(null);
              }}
              className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

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
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                {t("common.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  {t("customers.noCustomers")}
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-[var(--surface-hover)] transition cursor-pointer" onClick={(e) => { if ((e.target as HTMLElement).closest('button, a, input, select')) return; window.location.href = `/customers/${c.id}`; }}>
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
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleEdit(c)}
                    className="text-sm text-[var(--accent)] hover:brightness-110 mr-3"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
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
