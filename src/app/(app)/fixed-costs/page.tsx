"use client";

import { useState, useEffect, useCallback } from "react";
import { FixedCost, FixedCostInterval, FIXED_COST_INTERVAL_OPTIONS, FIXED_COST_CATEGORIES } from "@/lib/types";
import { getFixedCosts, createFixedCost, updateFixedCost, deleteFixedCost } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

function getMonthlyAmount(cost: FixedCost): number {
  if (cost.interval === "monthly") return cost.amount;
  if (cost.interval === "quarterly") return cost.amount / 3;
  return cost.amount / 12;
}

export default function FixedCostsPage() {
  const [costs, setCosts] = useState<FixedCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "other",
    amount: "" as string | number,
    vat_rate: 20,
    interval: "monthly" as FixedCostInterval,
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
    is_active: true,
    account_number: "",
    account_label: "",
    supplier: "",
    notes: "",
  });

  const loadData = useCallback(async () => {
    const data = await getFixedCosts();
    setCosts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function resetForm() {
    setForm({
      name: "", description: "", category: "other", amount: "", vat_rate: 20,
      interval: "monthly", start_date: new Date().toISOString().split("T")[0],
      end_date: "", is_active: true, account_number: "", account_label: "",
      supplier: "", notes: "",
    });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(cost: FixedCost) {
    setForm({
      name: cost.name,
      description: cost.description,
      category: cost.category,
      amount: cost.amount,
      vat_rate: cost.vat_rate,
      interval: cost.interval,
      start_date: cost.start_date,
      end_date: cost.end_date || "",
      is_active: cost.is_active,
      account_number: cost.account_number,
      account_label: cost.account_label,
      supplier: cost.supplier,
      notes: cost.notes,
    });
    setEditingId(cost.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      ...form,
      amount: Number(form.amount) || 0,
      end_date: form.end_date || null,
      currency: "EUR",
    };
    if (editingId) {
      await updateFixedCost(editingId, data);
    } else {
      await createFixedCost(data);
    }
    resetForm();
    await loadData();
  }

  async function handleDelete(id: string) {
    if (confirm("Fixkosten wirklich löschen?")) {
      await deleteFixedCost(id);
      await loadData();
    }
  }

  async function handleToggleActive(cost: FixedCost) {
    await updateFixedCost(cost.id, { is_active: !cost.is_active });
    await loadData();
  }

  const activeCosts = costs.filter((c) => c.is_active);
  const totalMonthly = activeCosts.reduce((sum, c) => sum + getMonthlyAmount(c), 0);
  const totalYearly = totalMonthly * 12;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-500">Laden...</div>
      </div>
    );
  }

  const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Fixkosten</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
        >
          + Neue Fixkosten
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-cyan-500 border border-[var(--border)] p-5">
          <p className="text-sm font-medium text-gray-400">Monatliche Fixkosten</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{formatCurrency(totalMonthly)}</p>
          <p className="text-xs text-gray-500 mt-1">{activeCosts.length} aktive Positionen</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-cyan-500/50 border border-[var(--border)] p-5">
          <p className="text-sm font-medium text-gray-400">Jährliche Fixkosten</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{formatCurrency(totalYearly)}</p>
          <p className="text-xs text-gray-500 mt-1">Hochrechnung auf 12 Monate</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-gray-500 border border-[var(--border)] p-5">
          <p className="text-sm font-medium text-gray-400">Gesamt Positionen</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{costs.length}</p>
          <p className="text-xs text-gray-500 mt-1">{costs.length - activeCosts.length} inaktiv</p>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            {editingId ? "Fixkosten bearbeiten" : "Neue Fixkosten"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Lieferant/Anbieter</label>
              <input type="text" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Kategorie</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                {FIXED_COST_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Betrag (netto) *</label>
              <input
                type="number" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value === "" ? "" : Number(e.target.value) })}
                step="0.01" min={0} placeholder="0.00" required
                className={inputClass + " no-spinners"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">USt-Satz (%)</label>
              <input type="number" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Intervall</label>
              <select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value as FixedCostInterval })} className={inputClass}>
                {FIXED_COST_INTERVAL_OPTIONS.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Startdatum</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Enddatum (optional)</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Kontonummer</label>
              <input type="text" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} placeholder="z.B. 7200" className={inputClass} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-400 mb-1">Beschreibung / Notizen</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-400">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded accent-[var(--accent)]" />
                Aktiv
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">
              {editingId ? "Speichern" : "Erstellen"}
            </button>
            <button type="button" onClick={resetForm} className="bg-[var(--surface-hover)] text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">
              Abbrechen
            </button>
          </div>
        </form>
      )}

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategorie</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lieferant</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Betrag</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Intervall</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Mtl.</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {costs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  Noch keine Fixkosten angelegt.
                </td>
              </tr>
            )}
            {costs.map((c) => {
              const catLabel = FIXED_COST_CATEGORIES.find((cat) => cat.value === c.category)?.label || c.category;
              const intLabel = FIXED_COST_INTERVAL_OPTIONS.find((i) => i.value === c.interval)?.label || c.interval;
              return (
                <tr key={c.id} className={`hover:bg-[var(--surface-hover)] transition ${!c.is_active ? "opacity-50" : ""}`}>
                  <td className="px-6 py-4">
                    <div className="font-medium text-[var(--text-primary)]">{c.name}</div>
                    {c.description && <div className="text-xs text-gray-500">{c.description}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">{catLabel}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{c.supplier || "—"}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(c.amount)}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{intLabel}</td>
                  <td className="px-6 py-4 text-sm text-right text-cyan-400">{formatCurrency(getMonthlyAmount(c))}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleToggleActive(c)}
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        c.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-gray-500/15 text-gray-500"
                      }`}
                    >
                      {c.is_active ? "Aktiv" : "Inaktiv"}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => startEdit(c)} className="text-sm text-[var(--accent)] hover:brightness-110 mr-3">
                      Bearbeiten
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="text-sm text-rose-400 hover:text-rose-300">
                      Löschen
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
