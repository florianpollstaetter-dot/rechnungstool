"use client";

// SCH-929 K2-λ P2.1 — minimal product-create dialog opened from the
// ProductCombobox's "+ Neues Produkt anlegen" option. Keeps the Angebot
// flow uninterrupted so the user can capture a missing product without
// navigating to /products.

import { useState } from "react";
import { Product, UNIT_OPTIONS, UnitType } from "@/lib/types";
import { createProduct, getSettings } from "@/lib/db";
import { useI18n } from "@/lib/i18n-context";

interface Props {
  initialName: string;
  onClose: () => void;
  onCreated: (product: Product) => void;
}

export default function ProductCreateModal({ initialName, onClose, onCreated }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<UnitType>("Stueck");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const settings = await getSettings();
      const product = await createProduct({
        name: name.trim(),
        description: description.trim(),
        name_en: "",
        description_en: "",
        unit,
        unit_price: Number((unitPrice || "0").replace(",", ".")) || 0,
        tax_rate: settings.default_tax_rate,
        active: true,
        role_id: null,
      });
      onCreated(product);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
          {t("products.newProduct")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-400 mb-1">
              {t("products.nameDe")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className={inputClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-400 mb-1">
              {t("products.descriptionDe")}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              {t("products.unit")}
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as UnitType)}
              className={inputClass}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              {t("products.pricePerUnit")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0,00"
              className={inputClass}
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 rounded-lg text-sm bg-rose-500/10 text-rose-400">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
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
