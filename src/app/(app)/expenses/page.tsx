"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ExpenseReport, ExpenseItem, ExpenseStatus } from "@/lib/types";
import { getExpenseReports, getExpenseItems, createExpenseReport, createExpenseItem, updateExpenseReport, deleteExpenseReport, deleteExpenseItem, uploadReceiptFile, getCurrentUserName } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import { useCompany } from "@/lib/company-context";

const EXPENSE_CATEGORIES = [
  { value: "travel", label: "Reisekosten" },
  { value: "meals", label: "Bewirtung" },
  { value: "office", label: "Büromaterial" },
  { value: "transport", label: "Transport/Fahrt" },
  { value: "telecom", label: "Telefon/Internet" },
  { value: "software", label: "Software/Lizenzen" },
  { value: "other", label: "Sonstiges" },
];

const statusConfig: Record<ExpenseStatus, { label: string; color: string }> = {
  draft: { label: "Entwurf", color: "bg-gray-500/15 text-gray-400" },
  submitted: { label: "Eingereicht", color: "bg-blue-500/15 text-blue-400" },
  approved: { label: "Genehmigt", color: "bg-emerald-500/15 text-emerald-400" },
  rejected: { label: "Abgelehnt", color: "bg-rose-500/15 text-rose-400" },
  booked: { label: "Gebucht", color: "bg-purple-500/15 text-purple-400" },
};

export default function ExpensesPage() {
  const { company, userRole, userName } = useCompany();
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [itemForm, setItemForm] = useState({ date: new Date().toISOString().split("T")[0], issuer: "", purpose: "", category: "other", amount_gross: "", vat_rate: "20", payment_method: "bar", notes: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const isManager = userRole === "admin" || userRole === "manager" || userRole === "accountant";

  const loadData = useCallback(async () => {
    const [r, i] = await Promise.all([getExpenseReports(), getExpenseItems()]);
    setReports(r);
    setItems(i);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreateReport() {
    const month = new Date().toISOString().slice(0, 7);
    const existing = reports.find((r) => r.period_month === month && r.status === "draft");
    if (existing) { setActiveReport(existing.id); return; }

    const report = await createExpenseReport({
      company_id: company.id,
      user_id: "",
      user_name: userName || getCurrentUserName(),
      period_month: month,
      report_number: "",
      status: "draft",
      total_amount: 0,
      submitted_at: null,
      approved_by: null,
      approved_at: null,
      notes: "",
    });
    setActiveReport(report.id);
    await loadData();
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!activeReport) return;
    setSaving(true);
    try {
      const gross = Number(itemForm.amount_gross) || 0;
      const vatRate = Number(itemForm.vat_rate) || 20;
      const net = Math.round(gross / (1 + vatRate / 100) * 100) / 100;
      const vat = Math.round((gross - net) * 100) / 100;

      let receiptPath: string | null = null;
      if (uploadFile) {
        const { path } = await uploadReceiptFile(uploadFile);
        receiptPath = path;
      }

      await createExpenseItem({
        expense_report_id: activeReport,
        company_id: company.id,
        date: itemForm.date,
        issuer: itemForm.issuer,
        purpose: itemForm.purpose,
        category: itemForm.category,
        amount_net: net,
        vat_rate: vatRate,
        amount_vat: vat,
        amount_gross: gross,
        payment_method: itemForm.payment_method,
        receipt_file_path: receiptPath,
        account_debit: "",
        notes: itemForm.notes,
      });

      // Update report total
      const reportItems = items.filter((i) => i.expense_report_id === activeReport);
      const newTotal = reportItems.reduce((s, i) => s + i.amount_gross, 0) + gross;
      await updateExpenseReport(activeReport, { total_amount: newTotal });

      setItemForm({ date: new Date().toISOString().split("T")[0], issuer: "", purpose: "", category: "other", amount_gross: "", vat_rate: "20", payment_method: "bar", notes: "" });
      setUploadFile(null);
      setShowNewItem(false);
      if (fileRef.current) fileRef.current.value = "";
      await loadData();
    } finally { setSaving(false); }
  }

  async function handleSubmitReport(id: string) {
    if (confirm("Spesenabrechnung einreichen? Sie kann danach nicht mehr bearbeitet werden.")) {
      await updateExpenseReport(id, { status: "submitted", submitted_at: new Date().toISOString() });
      await loadData();
    }
  }

  async function handleApprove(id: string) {
    await updateExpenseReport(id, { status: "approved", approved_by: userName, approved_at: new Date().toISOString() });
    await loadData();
  }

  async function handleReject(id: string) {
    const reason = prompt("Ablehnungsgrund:");
    if (reason !== null) {
      await updateExpenseReport(id, { status: "rejected", notes: reason });
      await loadData();
    }
  }

  async function handleDeleteItem(id: string) {
    if (confirm("Position löschen?")) {
      await deleteExpenseItem(id);
      await loadData();
    }
  }

  const activeReportData = activeReport ? reports.find((r) => r.id === activeReport) : null;
  const activeItems = activeReport ? items.filter((i) => i.expense_report_id === activeReport) : [];
  const activeTotal = activeItems.reduce((s, i) => s + i.amount_gross, 0);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;

  const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Spesen</h1>
        <button onClick={handleCreateReport} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">
          + Neue Abrechnung
        </button>
      </div>

      {/* Reports list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {reports.length === 0 && <p className="text-gray-500 text-sm col-span-3">Noch keine Spesenabrechnungen. Erstelle eine neue.</p>}
        {reports.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => {
          const st = statusConfig[r.status];
          const reportItems = items.filter((i) => i.expense_report_id === r.id);
          const total = reportItems.reduce((s, i) => s + i.amount_gross, 0);
          return (
            <div key={r.id}
              onClick={() => setActiveReport(r.id)}
              className={`bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 cursor-pointer transition hover:bg-[var(--surface-hover)] ${activeReport === r.id ? "ring-2 ring-[var(--accent)]" : ""}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-[var(--text-primary)] text-sm">{r.user_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{r.period_month}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
              </div>
              <p className="text-lg font-bold text-[var(--text-primary)]">{formatCurrency(total)}</p>
              <p className="text-xs text-[var(--text-muted)]">{reportItems.length} Position{reportItems.length !== 1 ? "en" : ""}</p>
            </div>
          );
        })}
      </div>

      {/* Active report detail */}
      {activeReportData && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Spesenabrechnung — {activeReportData.user_name} ({activeReportData.period_month})
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Gesamt: <span className="font-bold text-[var(--text-primary)]">{formatCurrency(activeTotal)}</span> · {activeItems.length} Positionen
              </p>
            </div>
            <div className="flex gap-2">
              {activeReportData.status === "draft" && (
                <>
                  <button onClick={() => setShowNewItem(true)} className="bg-[var(--accent)] text-black px-3 py-1.5 rounded-lg text-xs font-semibold hover:brightness-110 transition">+ Position</button>
                  <button onClick={() => handleSubmitReport(activeReportData.id)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-500 transition">Einreichen</button>
                </>
              )}
              {activeReportData.status === "submitted" && isManager && (
                <>
                  <button onClick={() => handleApprove(activeReportData.id)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-500 transition">Genehmigen</button>
                  <button onClick={() => handleReject(activeReportData.id)} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-rose-500 transition">Ablehnen</button>
                </>
              )}
            </div>
          </div>

          {/* New item form */}
          {showNewItem && activeReportData.status === "draft" && (
            <form onSubmit={handleAddItem} className="bg-[var(--background)] rounded-lg p-4 mb-4 border border-[var(--border)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Datum *</label>
                  <input type="date" value={itemForm.date} onChange={(e) => setItemForm({ ...itemForm, date: e.target.value })} required className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Lieferant/Geschäft *</label>
                  <input type="text" value={itemForm.issuer} onChange={(e) => setItemForm({ ...itemForm, issuer: e.target.value })} required placeholder="z.B. Restaurant XY" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Projekt/Zweck *</label>
                  <input type="text" value={itemForm.purpose} onChange={(e) => setItemForm({ ...itemForm, purpose: e.target.value })} required placeholder="z.B. Kundentermin" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Kategorie</label>
                  <select value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} className={inputClass}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Betrag brutto (€) *</label>
                  <input type="number" step="0.01" value={itemForm.amount_gross} onChange={(e) => setItemForm({ ...itemForm, amount_gross: e.target.value })} required placeholder="0.00" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">USt-Satz (%)</label>
                  <select value={itemForm.vat_rate} onChange={(e) => setItemForm({ ...itemForm, vat_rate: e.target.value })} className={inputClass}>
                    <option value="20">20%</option>
                    <option value="13">13%</option>
                    <option value="10">10%</option>
                    <option value="0">0%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Zahlungsart</label>
                  <select value={itemForm.payment_method} onChange={(e) => setItemForm({ ...itemForm, payment_method: e.target.value })} className={inputClass}>
                    <option value="bar">Bar</option>
                    <option value="karte">Karte (privat)</option>
                    <option value="firmenkarte">Firmenkarte</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Beleg</label>
                  <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="text-xs text-[var(--text-muted)] file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[var(--accent)] file:text-black" />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button type="submit" disabled={saving} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-xs font-semibold hover:brightness-110 transition disabled:opacity-50">
                  {saving ? "Speichern..." : "Position hinzufügen"}
                </button>
                <button type="button" onClick={() => setShowNewItem(false)} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-xs font-medium hover:bg-[var(--border)] transition">Abbrechen</button>
              </div>
            </form>
          )}

          {/* Items table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)]">
              <thead className="bg-[var(--background)]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">Datum</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">Lieferant</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">Zweck</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">Kategorie</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">Brutto</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">USt</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">Zahlung</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {activeItems.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-[var(--text-muted)] text-sm">Noch keine Positionen.</td></tr>}
                {activeItems.sort((a, b) => a.date.localeCompare(b.date)).map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--surface-hover)] transition">
                    <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">{formatDateLong(item.date)}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--text-primary)] font-medium">{item.issuer}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">{item.purpose}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--text-muted)]">{EXPENSE_CATEGORIES.find((c) => c.value === item.category)?.label || item.category}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-medium text-[var(--text-primary)]">{formatCurrency(item.amount_gross)}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-orange-400">{formatCurrency(item.amount_vat)} ({item.vat_rate}%)</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--text-muted)]">{item.payment_method}</td>
                    <td className="px-3 py-2.5 text-right">
                      {activeReportData.status === "draft" && (
                        <button onClick={() => handleDeleteItem(item.id)} className="text-rose-400 hover:text-rose-300 text-xs">×</button>
                      )}
                    </td>
                  </tr>
                ))}
                {activeItems.length > 0 && (
                  <tr className="bg-[var(--background)]">
                    <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-[var(--text-primary)]">Gesamt</td>
                    <td className="px-3 py-2.5 text-xs text-right font-bold text-[var(--text-primary)]">{formatCurrency(activeTotal)}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-orange-400">{formatCurrency(activeItems.reduce((s, i) => s + i.amount_vat, 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
