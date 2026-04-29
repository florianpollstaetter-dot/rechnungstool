"use client";

// SCH-929 K2-λ P2.1 — typeahead replacement for the product `<select>` on
// the Angebot create form. When the typed text doesn't exactly match an
// existing product, a "+ Neues Produkt anlegen: '<input>'" option appears
// at the bottom of the dropdown and triggers an inline-create popup so the
// user never has to leave the quote flow to define a new product.

import { useEffect, useMemo, useRef, useState } from "react";
import { Product } from "@/lib/types";
import { useI18n } from "@/lib/i18n-context";

interface Props {
  products: Product[];
  selectedId: string | null;
  onSelect: (productId: string | null) => void;
  onRequestCreate: (initialName: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ProductCombobox({
  products,
  selectedId,
  onSelect,
  onRequestCreate,
  disabled = false,
  placeholder,
}: Props) {
  const { t } = useI18n();
  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId],
  );
  // While the dropdown is closed, show the selected product's name. While
  // open, show whatever the user is typing. We avoid syncing this with a
  // useEffect (linter blocks setState-in-effect) by deriving the visible
  // value from the open flag and an explicit draft string.
  const [draft, setDraft] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visibleQuery = isOpen ? draft : (selected?.name ?? "");

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setDraft("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const trimmed = visibleQuery.trim();
  const lower = trimmed.toLowerCase();
  const filtered = useMemo(() => {
    if (!trimmed) return products;
    return products.filter((p) => {
      const haystack = `${p.name} ${p.description ?? ""} ${p.name_en ?? ""}`.toLowerCase();
      return haystack.includes(lower);
    });
  }, [products, trimmed, lower]);

  const exactMatch = useMemo(
    () => products.some((p) => p.name.trim().toLowerCase() === lower),
    [products, lower],
  );
  const showCreateOption = trimmed.length > 0 && !exactMatch;

  function handleSelect(productId: string) {
    onSelect(productId);
    setIsOpen(false);
    setDraft("");
  }

  function handleCreate() {
    onRequestCreate(trimmed);
    setIsOpen(false);
    setDraft("");
  }

  function handleClear() {
    onSelect(null);
    setDraft("");
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center">
        <input
          type="text"
          value={visibleQuery}
          onChange={(e) => {
            setDraft(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder ?? t("quoteNew.selectProduct")}
          disabled={disabled}
          className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
        />
        {selectedId && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-1 text-gray-500 hover:text-rose-400 text-sm px-1"
            title={t("common.delete")}
          >
            ×
          </button>
        )}
      </div>
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {filtered.length === 0 && !showCreateOption && (
            <div className="px-3 py-2 text-xs text-gray-500">
              {t("quoteNew.comboboxEmpty")}
            </div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p.id)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-hover)] focus:bg-[var(--surface-hover)] focus:outline-none ${
                p.id === selectedId ? "bg-[var(--surface-hover)]" : ""
              }`}
            >
              <div className="text-[var(--text-primary)]">{p.name}</div>
              {p.description && (
                <div className="text-xs text-gray-500 truncate">{p.description}</div>
              )}
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              onClick={handleCreate}
              className="w-full text-left px-3 py-2 text-sm border-t border-[var(--border)] bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 focus:bg-[var(--accent)]/20 focus:outline-none"
            >
              + {t("quoteNew.comboboxCreate", { name: trimmed })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
