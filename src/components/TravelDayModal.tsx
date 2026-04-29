"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import { formatCurrency } from "@/lib/format";

export interface SelectableItem {
  id: string;
  position: number;
  description: string;
  unit_price: number;
}

interface Props {
  items: SelectableItem[];
  initialSelected?: string[];
  initialPercent?: number;
  onClose: () => void;
  onConfirm: (referencedIds: string[], percent: number, computedUnitPrice: number) => void;
}

export default function TravelDayModal({
  items,
  initialSelected = [],
  initialPercent = 50,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [percent, setPercent] = useState(initialPercent);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sumSelected = items
    .filter((i) => selected.has(i.id))
    .reduce((sum, i) => sum + i.unit_price, 0);
  const computed = Math.round(sumSelected * (percent / 100) * 100) / 100;

  function handleConfirm() {
    onConfirm(Array.from(selected), percent, computed);
    onClose();
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
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
          {t("quoteNew.travelDayTitle")}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          {t("quoteNew.travelDayHelp")}
        </p>

        {items.length === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center">
            {t("quoteNew.travelDayNoItems")}
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded-lg divide-y divide-[var(--border)] mb-4">
            {items.map((it) => (
              <label
                key={it.id}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--surface-hover)]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(it.id)}
                  onChange={() => toggle(it.id)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="flex-1 text-sm text-[var(--text-primary)]">
                  {it.position}. {it.description || `(${t("quoteNew.untitledItem")})`}
                </span>
                <span className="text-sm text-gray-500">
                  {formatCurrency(it.unit_price)}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-[var(--text-secondary)]">
            {t("quoteNew.travelDayPercent")}
          </label>
          <input
            type="number"
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            min={0}
            max={100}
            step={1}
            className="w-20 bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-right text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <span className="text-sm text-gray-500">%</span>
          <div className="ml-auto text-sm">
            <span className="text-[var(--text-secondary)]">{t("quoteNew.travelDayComputed")}: </span>
            <span className="font-semibold text-[var(--text-primary)]">{formatCurrency(computed)}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
          >
            {t("common.save")}
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
