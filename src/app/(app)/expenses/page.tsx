"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ExpenseReport, ExpenseItem, ExpenseStatus, PaymentMethod } from "@/lib/types";
import { getExpenseReports, getExpenseItems, createExpenseReport, createExpenseItem, updateExpenseReport, deleteExpenseReport, deleteExpenseItem, updateExpenseItem, uploadReceiptFile, getReceiptFileUrl, getCurrentUserName, getSettings } from "@/lib/db";
import { CompanySettings } from "@/lib/types";
import type { ReceiptImageData } from "@/components/ExpenseReportPDF";
import { formatCurrency, formatDateLong } from "@/lib/format";
import { useCompany } from "@/lib/company-context";
import { createClient } from "@/lib/supabase/client";
import ReceiptCaptureModal from "@/components/ReceiptCaptureModal";
import { useI18n } from "@/lib/i18n-context";

const EXPENSE_CATEGORY_KEYS: { value: string; key: "expenses.categoryTravel" | "expenses.categoryMeals" | "expenses.categoryOffice" | "expenses.categoryTransport" | "expenses.categoryTelecom" | "expenses.categorySoftware" | "expenses.categoryOther" }[] = [
  { value: "travel", key: "expenses.categoryTravel" },
  { value: "meals", key: "expenses.categoryMeals" },
  { value: "office", key: "expenses.categoryOffice" },
  { value: "transport", key: "expenses.categoryTransport" },
  { value: "telecom", key: "expenses.categoryTelecom" },
  { value: "software", key: "expenses.categorySoftware" },
  { value: "other", key: "expenses.categoryOther" },
];

const STATUS_KEYS: Record<ExpenseStatus, { key: "expenses.statusDraft" | "expenses.statusSubmitted" | "expenses.statusApproved" | "expenses.statusRejected" | "expenses.statusBooked"; color: string }> = {
  draft: { key: "expenses.statusDraft", color: "bg-gray-500/15 text-gray-400" },
  submitted: { key: "expenses.statusSubmitted", color: "bg-blue-500/15 text-blue-400" },
  approved: { key: "expenses.statusApproved", color: "bg-emerald-500/15 text-emerald-400" },
  rejected: { key: "expenses.statusRejected", color: "bg-rose-500/15 text-rose-400" },
  booked: { key: "expenses.statusBooked", color: "bg-purple-500/15 text-purple-400" },
};

export default function ExpensesPage() {
  const { t } = useI18n();
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
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editItemUrl, setEditItemUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

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
      let receiptFileType: string | null = null;
      if (uploadFile) {
        const { path } = await uploadReceiptFile(uploadFile);
        receiptPath = path;
        receiptFileType = uploadFile.name.split(".").pop()?.toLowerCase() || null;
      }

      const newItem = await createExpenseItem({
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
        receipt_file_type: receiptFileType,
        account_debit: "",
        account_label: "",
        notes: itemForm.notes,
        analysis_status: receiptPath ? "pending" : "done",
        analysis_raw: null,
        analysis_cost: null,
      });

      // Auto-analyze if receipt was uploaded
      if (receiptPath) {
        analyzeExpenseItem(newItem.id);
      }

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

  // Camera capture flow: open ReceiptCaptureModal, then create item from cropped image
  function handleCameraCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCaptureFile(file);
    e.target.value = "";
  }

  async function handleCaptureSubmit(croppedFile: File, meta: { purpose: string; account_debit: string; account_label: string; payment_method: PaymentMethod }) {
    setCaptureFile(null);
    if (!activeReport) return;
    setUploading(true);
    try {
      const fileType = croppedFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const { path } = await uploadReceiptFile(croppedFile);
      const newItem = await createExpenseItem({
        expense_report_id: activeReport,
        company_id: company.id,
        date: new Date().toISOString().split("T")[0],
        issuer: "",
        purpose: meta.purpose || "",
        category: "other",
        amount_net: 0,
        vat_rate: 0,
        amount_vat: 0,
        amount_gross: 0,
        payment_method: meta.payment_method || "bar",
        receipt_file_path: path,
        receipt_file_type: fileType,
        account_debit: meta.account_debit || "",
        account_label: meta.account_label || "",
        notes: "",
        analysis_status: "pending",
        analysis_raw: null,
        analysis_cost: null,
      });
      analyzeExpenseItem(newItem.id);
      await loadData();
    } catch (err) {
      alert(t("expenses.uploadFailed") + " " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
    }
  }

  // File upload flow (without camera/crop): upload directly + analyze
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeReport) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fileType = file.name.split(".").pop()?.toLowerCase() || "pdf";
        const { path } = await uploadReceiptFile(file);
        const newItem = await createExpenseItem({
          expense_report_id: activeReport,
          company_id: company.id,
          date: new Date().toISOString().split("T")[0],
          issuer: "",
          purpose: "",
          category: "other",
          amount_net: 0,
          vat_rate: 0,
          amount_vat: 0,
          amount_gross: 0,
          payment_method: "",
          receipt_file_path: path,
          receipt_file_type: fileType,
          account_debit: "",
          account_label: "",
          notes: "",
          analysis_status: "pending",
          analysis_raw: null,
          analysis_cost: null,
        });
        analyzeExpenseItem(newItem.id);
      }
      await loadData();
    } catch (err) {
      alert(t("expenses.uploadFailed") + " " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
      if (fileUploadRef.current) fileUploadRef.current.value = "";
    }
  }

  async function analyzeExpenseItem(id: string) {
    setAnalyzing(id);
    try {
      const res = await fetch("/api/analyze-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseItemId: id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: t("expenses.analysisFailed") }));
        console.error("Analysis error:", err);
      }
      await loadData();
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setAnalyzing(null);
    }
  }

  async function handleDownloadPdf() {
    if (!activeReportData) return;
    setPdfLoading(true);
    try {
      const settings: CompanySettings = await getSettings();
      let logoUrl = settings.logo_url;
      if (logoUrl && !logoUrl.startsWith("http")) {
        logoUrl = `${window.location.origin}${logoUrl}`;
      }
      const absSettings = { ...settings, logo_url: logoUrl || "" };

      // Fetch receipt images as data URLs (only image types, skip PDFs)
      const receiptImages: ReceiptImageData[] = [];
      const supabase = createClient();
      for (const item of activeItems) {
        if (!item.receipt_file_path) continue;
        const ext = (item.receipt_file_type || "").toLowerCase();
        if (ext === "pdf") continue; // can't embed PDF in PDF via react-pdf
        const { data } = await supabase.storage.from("receipts").createSignedUrl(item.receipt_file_path, 300);
        if (!data?.signedUrl) continue;
        try {
          const resp = await fetch(data.signedUrl);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          receiptImages.push({
            itemId: item.id,
            dataUrl,
            label: [item.issuer, item.purpose, item.date].filter(Boolean).join(" — "),
          });
        } catch {
          // skip receipts that fail to load
        }
      }

      const { pdf } = await import("@react-pdf/renderer");
      const { default: ExpenseReportPDF } = await import("@/components/ExpenseReportPDF");
      const blob = await pdf(
        <ExpenseReportPDF report={activeReportData} items={activeItems} settings={absSettings} receiptImages={receiptImages} />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Spesen_${activeReportData.user_name.replace(/\s/g, "_")}_${activeReportData.period_month}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert(t("expenses.pdfFailed") + " " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleViewReceipt(item: ExpenseItem) {
    if (!item.receipt_file_path) return;
    const supabase = createClient();
    const { data } = await supabase.storage.from("receipts").createSignedUrl(item.receipt_file_path, 300);
    if (data?.signedUrl) {
      setEditItemId(item.id);
      setEditItemUrl(data.signedUrl);
    }
  }

  async function handleSaveCrop(blob: Blob) {
    if (!editItemId) return;
    const item = items.find((i) => i.id === editItemId);
    if (!item) return;
    const croppedFile = new File([blob], (item.receipt_file_path || "receipt").replace(/\.\w+$/, "_cropped.jpg"), { type: "image/jpeg" });
    const { path } = await uploadReceiptFile(croppedFile);
    await updateExpenseItem(editItemId, {
      receipt_file_path: path,
      receipt_file_type: "jpg",
    } as Partial<ExpenseItem>);
    setEditItemId(null);
    setEditItemUrl(null);
    await loadData();
  }

  async function handleDeleteReceiptFile(itemId: string) {
    if (!confirm(t("expenses.deleteReceipt"))) return;
    const item = items.find((i) => i.id === itemId);
    if (item?.receipt_file_path) {
      const supabase = createClient();
      await supabase.storage.from("receipts").remove([item.receipt_file_path]);
    }
    await updateExpenseItem(itemId, { receipt_file_path: null, receipt_file_type: null, analysis_status: "done", analysis_raw: null, analysis_cost: null } as unknown as Partial<ExpenseItem>);
    await loadData();
  }

  async function handleSubmitReport(id: string) {
    if (confirm(t("expenses.submitConfirm"))) {
      await updateExpenseReport(id, { status: "submitted", submitted_at: new Date().toISOString() });
      await loadData();
    }
  }

  async function handleApprove(id: string) {
    await updateExpenseReport(id, { status: "approved", approved_by: userName, approved_at: new Date().toISOString() });
    await loadData();
  }

  async function handleReject(id: string) {
    const reason = prompt(t("expenses.rejectReason"));
    if (reason !== null) {
      await updateExpenseReport(id, { status: "rejected", notes: reason });
      await loadData();
    }
  }

  async function handleDeleteItem(id: string) {
    if (confirm(t("expenses.deletePosition"))) {
      await deleteExpenseItem(id);
      await loadData();
    }
  }

  const activeReportData = activeReport ? reports.find((r) => r.id === activeReport) : null;
  const activeItems = activeReport ? items.filter((i) => i.expense_report_id === activeReport) : [];
  const activeTotal = activeItems.reduce((s, i) => s + i.amount_gross, 0);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;

  const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_KEYS.map((c) => ({ value: c.value, label: t(c.key) }));
  const statusConfig = Object.fromEntries(
    Object.entries(STATUS_KEYS).map(([k, v]) => [k, { label: t(v.key), color: v.color }])
  ) as Record<ExpenseStatus, { label: string; color: string }>;

  const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("expenses.title")}</h1>
        <button onClick={handleCreateReport} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">
          {t("expenses.newReport")}
        </button>
      </div>

      {/* Reports list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {reports.length === 0 && <p className="text-gray-500 text-sm col-span-3">{t("expenses.noReports")}</p>}
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
              <p className="text-xs text-[var(--text-muted)]">{reportItems.length} {t("expenses.positions")}</p>
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
                {t("expenses.reportTitle")} — {activeReportData.user_name} ({activeReportData.period_month})
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                {t("common.total")}: <span className="font-bold text-[var(--text-primary)]">{formatCurrency(activeTotal)}</span> · {activeItems.length} {t("expenses.positions")}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* PDF download — always available when there are items */}
              {activeItems.length > 0 && (
                <button
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[var(--border)] transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {pdfLoading ? t("expenses.pdfGenerating") : t("expenses.pdfExport")}
                </button>
              )}
              {activeReportData.status === "draft" && (
                <>
                  {/* Camera button */}
                  <label className={`bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-cyan-500 transition cursor-pointer flex items-center gap-1.5 ${uploading ? "opacity-50" : ""}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                    {t("expenses.camera")}
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleCameraCapture}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                  {/* File upload button */}
                  <label className={`bg-[var(--accent)] text-black px-3 py-1.5 rounded-lg text-xs font-semibold hover:brightness-110 transition cursor-pointer ${uploading ? "opacity-50" : ""}`}>
                    {uploading ? t("common.uploading") : t("expenses.uploadReceipt")}
                    <input
                      ref={fileUploadRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      multiple
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                  <button onClick={() => setShowNewItem(true)} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[var(--border)] transition">{t("expenses.manual")}</button>
                  <button onClick={() => handleSubmitReport(activeReportData.id)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-500 transition">{t("expenses.submit")}</button>
                </>
              )}
              {activeReportData.status === "submitted" && isManager && (
                <>
                  <button onClick={() => handleApprove(activeReportData.id)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-500 transition">{t("expenses.approve")}</button>
                  <button onClick={() => handleReject(activeReportData.id)} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-rose-500 transition">{t("expenses.reject")}</button>
                </>
              )}
            </div>
          </div>

          {/* New item form (manual entry) */}
          {showNewItem && activeReportData.status === "draft" && (
            <form onSubmit={handleAddItem} className="bg-[var(--background)] rounded-lg p-4 mb-4 border border-[var(--border)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{t("expenses.dateLabel")}</label>
                  <input type="date" value={itemForm.date} onChange={(e) => setItemForm({ ...itemForm, date: e.target.value })} required className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{t("expenses.supplier")}</label>
                  <input type="text" value={itemForm.issuer} onChange={(e) => setItemForm({ ...itemForm, issuer: e.target.value })} required placeholder={t("expenses.supplierPlaceholder")} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{t("expenses.purpose")}</label>
                  <input type="text" value={itemForm.purpose} onChange={(e) => setItemForm({ ...itemForm, purpose: e.target.value })} required placeholder={t("expenses.purposePlaceholder")} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{t("expenses.category")}</label>
                  <select value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} className={inputClass}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{t("expenses.amountGross")}</label>
                  <input type="number" step="0.01" value={itemForm.amount_gross} onChange={(e) => setItemForm({ ...itemForm, amount_gross: e.target.value })} required placeholder="0.00" className={`${inputClass} no-spinners`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{t("expenses.paymentMethod")}</label>
                  <select value={itemForm.payment_method} onChange={(e) => setItemForm({ ...itemForm, payment_method: e.target.value })} className={inputClass}>
                    <option value="bar">{t("expenses.paymentCash")}</option>
                    <option value="karte">{t("expenses.paymentCardPrivate")}</option>
                    <option value="firmenkarte">{t("expenses.paymentCompanyCard")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{t("expenses.receipt")}</label>
                  <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="text-xs text-[var(--text-muted)] file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[var(--accent)] file:text-black" />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button type="submit" disabled={saving} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-xs font-semibold hover:brightness-110 transition disabled:opacity-50">
                  {saving ? t("common.saving") : t("expenses.addPosition")}
                </button>
                <button type="button" onClick={() => setShowNewItem(false)} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-xs font-medium hover:bg-[var(--border)] transition">{t("common.cancel")}</button>
              </div>
            </form>
          )}

          {/* Items table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)]">
              <thead className="bg-[var(--background)]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">{t("expenses.colStatus")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">{t("expenses.colDate")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">{t("expenses.colSupplier")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">{t("expenses.colPurpose")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">{t("expenses.colCategory")}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">{t("expenses.colGross")}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">{t("expenses.colVat")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">{t("expenses.colAccount")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">{t("expenses.colPayment")}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">{t("expenses.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {activeItems.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-[var(--text-muted)] text-sm">{t("expenses.noPositions")}</td></tr>}
                {activeItems.sort((a, b) => a.date.localeCompare(b.date)).map((item) => {
                  const isItemAnalyzing = analyzing === item.id || item.analysis_status === "analyzing";
                  return (
                    <tr key={item.id} className="hover:bg-[var(--surface-hover)] transition">
                      {/* Analysis status */}
                      <td className="px-3 py-2.5 text-xs">
                        {item.receipt_file_path ? (
                          item.analysis_status === "done" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400" title={t("expenses.analysisDone")}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
                              {item.analysis_cost != null && <span className="text-[10px] text-[var(--text-muted)]">{item.analysis_cost.toFixed(4)}€</span>}
                            </span>
                          ) : item.analysis_status === "analyzing" || isItemAnalyzing ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 animate-pulse" title={t("expenses.analyzing")}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                            </span>
                          ) : item.analysis_status === "error" ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 cursor-pointer" title={typeof item.analysis_raw?.error === "string" ? item.analysis_raw.error : t("expenses.analysisError")} onClick={() => alert(typeof item.analysis_raw?.error === "string" ? item.analysis_raw.error : t("expenses.analysisFailed"))}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            </span>
                          ) : (
                            <span className="text-gray-500" title={t("expenses.analysisPending")}>—</span>
                          )
                        ) : (
                          <span className="text-gray-600" title={t("expenses.noReceipt")}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">{formatDateLong(item.date)}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--text-primary)] font-medium">{item.issuer || <span className="text-[var(--text-muted)] italic">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">{item.purpose || <span className="text-[var(--text-muted)] italic">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--text-muted)]">{EXPENSE_CATEGORIES.find((c) => c.value === item.category)?.label || item.category}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-medium text-[var(--text-primary)]">{item.amount_gross ? formatCurrency(item.amount_gross) : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-right text-orange-400">{item.amount_vat ? `${formatCurrency(item.amount_vat)} (${item.vat_rate}%)` : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--text-muted)]">{item.account_debit ? <span title={item.account_label || ""}>{item.account_debit}</span> : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--text-muted)]">{item.payment_method || "—"}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* View receipt */}
                          {item.receipt_file_path && (
                            <button onClick={() => handleViewReceipt(item)} className="text-blue-400 hover:text-blue-300 p-1" title={t("expenses.viewReceipt")}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                          )}
                          {/* Re-analyze */}
                          {item.receipt_file_path && activeReportData.status === "draft" && (
                            <button onClick={() => analyzeExpenseItem(item.id)} disabled={isItemAnalyzing} className="text-[var(--accent)] hover:brightness-110 p-1 disabled:opacity-50" title={t("expenses.reAnalyze")}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                            </button>
                          )}
                          {/* Delete receipt file */}
                          {item.receipt_file_path && activeReportData.status === "draft" && (
                            <button onClick={() => handleDeleteReceiptFile(item.id)} className="text-orange-400 hover:text-orange-300 p-1" title={t("expenses.removeReceipt")}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                            </button>
                          )}
                          {/* Delete item */}
                          {activeReportData.status === "draft" && (
                            <button onClick={() => handleDeleteItem(item.id)} className="text-rose-400 hover:text-rose-300 p-1" title={t("expenses.deleteItem")}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {activeItems.length > 0 && (
                  <tr className="bg-[var(--background)]">
                    <td className="px-3 py-2.5"></td>
                    <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-[var(--text-primary)]">{t("common.total")}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-bold text-[var(--text-primary)]">{formatCurrency(activeTotal)}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-orange-400">{formatCurrency(activeItems.reduce((s, i) => s + i.amount_vat, 0))}</td>
                    <td colSpan={3}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Camera capture modal */}
      {captureFile && (
        <ReceiptCaptureModal
          imageFile={captureFile}
          onSubmit={handleCaptureSubmit}
          onCancel={() => setCaptureFile(null)}
        />
      )}

      {/* Edit/view receipt modal */}
      {editItemId && editItemUrl && (
        <ReceiptCaptureModal
          imageUrl={editItemUrl}
          editMode
          onSaveCrop={handleSaveCrop}
          onCancel={() => { setEditItemId(null); setEditItemUrl(null); }}
        />
      )}
    </div>
  );
}
