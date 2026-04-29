"use client";

import { useState } from "react";
import { Customer } from "@/lib/types";
import { createCustomer } from "@/lib/db";
import { useI18n } from "@/lib/i18n-context";

interface Props {
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  initialName?: string;
}

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

type Field = keyof typeof emptyCustomer;

export default function CustomerCreateModal({ onClose, onCreated, initialName = "" }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState({ ...emptyCustomer, name: initialName });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    confidence?: string;
    source?: string;
    cost_eur?: number;
  } | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);
  const [aiFilledKeys, setAiFilledKeys] = useState<Set<Field>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fields: { key: Field; label: string }[] = [
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

  const visibleFields = showAllFields
    ? fields
    : fields.filter((f) => f.key === "name" || f.key === "company");
  const canSearchAi = (form.name.trim() || form.company.trim()).length > 0;

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
        const filled = new Set<Field>();
        setForm((prev) => {
          const updated = { ...prev };
          (Object.keys(data.customer) as Field[]).forEach((key) => {
            if (!updated[key] && data.customer[key]) {
              updated[key] = data.customer[key];
              filled.add(key);
            }
          });
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

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createCustomer(form);
      onCreated(created);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("customers.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
          {t("customers.newCustomer")}
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

        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={handleAiComplete}
            disabled={aiLoading || !canSearchAi}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {aiLoading ? t("customers.researching") : t("customers.aiCompletion")}
          </button>
          {!showAllFields && (
            <button
              type="button"
              onClick={() => setShowAllFields(true)}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition underline underline-offset-2"
            >
              {t("customers.fillManually")}
            </button>
          )}
        </div>

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
                    ({t("customers.aiConfidence")}: {" "}
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
                  <span className="ml-2 opacity-50">({aiResult.cost_eur.toFixed(4)} EUR)</span>
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

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (!form.name.trim() && !form.company.trim())}
            className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
