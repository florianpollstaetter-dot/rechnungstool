"use client";

// SCH-921 K2-J1 — Admin-managed labels for the Zeiterfassung "Allgemein"
// and "Sonstiges" picker tabs. Replaces the previously hardcoded list so
// each company can keep its own non-project labels (Daily, Sprint Planning,
// Recruiting, On-Call, …). Visible only to company admins.

import { useEffect, useState } from "react";
import {
  getGeneralCategories,
  createGeneralCategory,
  updateGeneralCategory,
  deleteGeneralCategory,
} from "@/lib/db";
import { GeneralCategory, GeneralCategoryGroup } from "@/lib/types";

interface DraftRow {
  id: string;
  label: string;
  group_key: GeneralCategoryGroup;
  sort_order: number;
  // True when the row exists only in the UI (id starts with `default:` or
  // `new:`), so we know to INSERT instead of UPDATE.
  isUnsaved: boolean;
}

function isPersisted(id: string): boolean {
  return !id.startsWith("default:") && !id.startsWith("new:");
}

export default function GeneralCategoriesSection() {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cats = await getGeneralCategories();
        if (cancelled) return;
        setRows(
          cats.map((c) => ({
            id: c.id,
            label: c.label,
            group_key: c.group_key,
            sort_order: c.sort_order,
            isUnsaved: !isPersisted(c.id),
          })),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function updateRow(id: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commitRow(row: DraftRow) {
    if (!row.label.trim()) return;
    setSavingId(row.id);
    setError(null);
    try {
      if (row.isUnsaved) {
        const created = await createGeneralCategory({
          label: row.label,
          group_key: row.group_key,
          sort_order: row.sort_order,
        });
        setRows((prev) => prev.map((r) => (
          r.id === row.id
            ? { id: created.id, label: created.label, group_key: created.group_key, sort_order: created.sort_order, isUnsaved: false }
            : r
        )));
      } else {
        const updated = await updateGeneralCategory(row.id, {
          label: row.label,
          group_key: row.group_key,
          sort_order: row.sort_order,
        });
        setRows((prev) => prev.map((r) => (
          r.id === row.id
            ? { id: updated.id, label: updated.label, group_key: updated.group_key, sort_order: updated.sort_order, isUnsaved: false }
            : r
        )));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSavingId(null);
    }
  }

  async function removeRow(row: DraftRow) {
    if (!window.confirm(`Kategorie "${row.label}" wirklich löschen?`)) return;
    setSavingId(row.id);
    setError(null);
    try {
      if (!row.isUnsaved) {
        await deleteGeneralCategory(row.id);
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    } finally {
      setSavingId(null);
    }
  }

  function addRow(group: GeneralCategoryGroup) {
    const tempId = `new:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const maxSort = rows
      .filter((r) => r.group_key === group)
      .reduce((m, r) => Math.max(m, r.sort_order), 0);
    setRows((prev) => [
      ...prev,
      { id: tempId, label: "", group_key: group, sort_order: maxSort + 10, isUnsaved: true },
    ]);
  }

  const allgemein = rows.filter((r) => r.group_key === "allgemein").sort((a, b) => a.sort_order - b.sort_order);
  const sonstiges = rows.filter((r) => r.group_key === "sonstiges").sort((a, b) => a.sort_order - b.sort_order);

  if (loading) {
    return (
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
        <p className="text-sm text-[var(--text-muted)]">Lädt Kategorien…</p>
      </div>
    );
  }

  function renderGroup(label: string, group: GeneralCategoryGroup, items: DraftRow[]) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{label}</h3>
        {items.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] italic">Noch keine Einträge.</p>
        )}
        {items.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <input
              type="text"
              value={row.label}
              onChange={(e) => updateRow(row.id, { label: e.target.value })}
              onBlur={() => { if (row.label.trim()) commitRow(row); }}
              placeholder="Kategorie-Name"
              className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
            />
            <input
              type="number"
              value={row.sort_order}
              onChange={(e) => updateRow(row.id, { sort_order: Number(e.target.value) || 0 })}
              onBlur={() => { if (row.label.trim()) commitRow(row); }}
              className="w-16 bg-[var(--background)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
              title="Sortier-Reihenfolge"
            />
            <button
              type="button"
              onClick={() => removeRow(row)}
              disabled={savingId === row.id}
              className="px-2 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 transition disabled:opacity-40"
              title="Löschen"
            >×</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => addRow(group)}
          className="text-xs font-medium text-[var(--brand-orange)] hover:opacity-80 transition"
        >+ Hinzufügen</button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Allgemein-Kategorien</h2>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Diese Labels erscheinen in der Zeiterfassung unter „Allgemein" bzw. „Other".
        Änderungen wirken sich sofort auf alle Mitarbeiter aus.
      </p>
      {error && (
        <p className="mb-3 text-xs text-rose-400">{error}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderGroup("Allgemein", "allgemein", allgemein)}
        {renderGroup("Sonstiges", "sonstiges", sonstiges)}
      </div>
    </div>
  );
}
