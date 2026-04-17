"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Receipt, PAYMENT_METHOD_OPTIONS, PaymentMethod } from "@/lib/types";
import { getReceipts, createReceipt, updateReceipt, deleteReceipt, uploadReceiptFile } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import ReceiptCaptureModal from "@/components/ReceiptCaptureModal";
import DocumentScannerModal from "@/components/DocumentScannerModal";

const ACCOUNT_OPTIONS = [
  { value: "", label: "—" },
  { value: "5000", label: "5000 Wareneinkauf" },
  { value: "5880", label: "5880 Reisekosten" },
  { value: "6000", label: "6000 Mietaufwand" },
  { value: "6300", label: "6300 Versicherungen" },
  { value: "6800", label: "6800 Porto/Telefon" },
  { value: "7200", label: "7200 Büroaufwand" },
  { value: "7300", label: "7300 Rechts-/Beratung" },
  { value: "7350", label: "7350 Buchhaltung/Steuerberatung" },
  { value: "7400", label: "7400 Werbung/Marketing" },
  { value: "7600", label: "7600 Telefonkosten" },
  { value: "7650", label: "7650 Internet/EDV" },
  { value: "7700", label: "7700 KFZ-Aufwand" },
  { value: "7780", label: "7780 Bewirtung" },
  { value: "7790", label: "7790 Catering Projekte" },
  { value: "7795", label: "7795 Geschäftsanbahnung" },
  { value: "7800", label: "7800 Abschreibungen" },
  { value: "7890", label: "7890 GWG (< 1000 EUR)" },
  { value: "8000", label: "8000 Sonstige Aufwendungen" },
];

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleScanCapture(file: File) {
    setScannerOpen(false);
    setCaptureFile(file);
  }

  async function handleCaptureSubmit(croppedFile: File, meta: { purpose: string; account_debit: string; account_label: string; payment_method: PaymentMethod }) {
    setCaptureFile(null);
    setUploading(true);
    try {
      const fileType = croppedFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const { path } = await uploadReceiptFile(croppedFile);
      const receipt = await createReceipt({
        file_name: croppedFile.name,
        file_path: path,
        file_type: fileType,
        file_size: croppedFile.size,
        invoice_date: null,
        purpose: meta.purpose || null,
        issuer: null,
        amount_net: null,
        amount_gross: null,
        amount_vat: null,
        vat_rate: null,
        account_debit: meta.account_debit || null,
        account_credit: null,
        account_label: meta.account_label || null,
        currency: "EUR",
        payment_method: meta.payment_method,
        analysis_cost: null,
        notes: null,
        analysis_status: "pending",
        analysis_raw: null,
      });
      analyzeReceipt(receipt.id);
      await loadData();
    } catch (err) {
      alert("Upload fehlgeschlagen: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
    }
  }

  const [editReceiptId, setEditReceiptId] = useState<string | null>(null);
  const [editReceiptUrl, setEditReceiptUrl] = useState<string | null>(null);

  async function handleViewReceipt(r: Receipt) {
    const supabase = createClient();
    const { data } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 300);
    if (data?.signedUrl) {
      setEditReceiptId(r.id);
      setEditReceiptUrl(data.signedUrl);
    }
  }

  async function handleSaveCrop(blob: Blob) {
    if (!editReceiptId) return;
    const receipt = receipts.find((r) => r.id === editReceiptId);
    if (!receipt) return;
    // Upload cropped version as new file
    const croppedFile = new File([blob], receipt.file_name.replace(/\.\w+$/, "_cropped.jpg"), { type: "image/jpeg" });
    const { path } = await uploadReceiptFile(croppedFile);
    // Update the receipt with the cropped file path (original stays in analysis_raw)
    await updateReceipt(editReceiptId, {
      file_path: path,
      file_name: croppedFile.name,
      file_size: croppedFile.size,
      analysis_raw: { ...receipt.analysis_raw, original_file_path: receipt.file_path },
    } as Partial<Receipt>);
    setEditReceiptId(null);
    setEditReceiptUrl(null);
    await loadData();
  }

  const loadData = useCallback(async () => {
    const data = await getReceipts();
    setReceipts(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fileType = file.name.split(".").pop()?.toLowerCase() || "pdf";
        const { path } = await uploadReceiptFile(file);
        const receipt = await createReceipt({
          file_name: file.name,
          file_path: path,
          file_type: fileType,
          file_size: file.size,
          invoice_date: null,
          purpose: null,
          issuer: null,
          amount_net: null,
          amount_gross: null,
          amount_vat: null,
          vat_rate: null,
          account_debit: null,
          account_credit: null,
          account_label: null,
          currency: "EUR",
          payment_method: "",
          analysis_cost: null,
          notes: null,
          analysis_status: "pending",
          analysis_raw: null,
        });
        // Trigger AI analysis
        analyzeReceipt(receipt.id);
      }
      await loadData();
    } catch (err) {
      alert("Upload fehlgeschlagen: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function analyzeReceipt(id: string) {
    setAnalyzing(id);
    try {
      const res = await fetch("/api/analyze-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId: id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Analyse fehlgeschlagen" }));
        console.error("Analysis error:", err);
      }
      await loadData();
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setAnalyzing(null);
    }
  }

  async function handleDelete(id: string) {
    if (confirm("Beleg wirklich löschen?")) {
      await deleteReceipt(id);
      await loadData();
    }
  }

  async function handleFieldUpdate(id: string, field: string, value: string | number | null) {
    await updateReceipt(id, { [field]: value });
    await loadData();
    setEditingId(null);
  }

  const totalGross = receipts.reduce((sum, r) => sum + (r.amount_gross || 0), 0);
  const totalNet = receipts.reduce((sum, r) => sum + (r.amount_net || 0), 0);
  const totalVat = receipts.reduce((sum, r) => sum + (r.amount_vat || 0), 0);
  const totalAnalysisCost = receipts.reduce((sum, r) => sum + (r.analysis_cost || 0), 0);

  // Monthly analysis cost (current month)
  const now = new Date();
  const monthlyAnalysisCost = receipts
    .filter((r) => {
      const d = new Date(r.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, r) => sum + (r.analysis_cost || 0), 0);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;

  const inputClass = "bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-full";

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Belege</h1>
        <div className="flex gap-2 flex-wrap">
          {/* Scanner button */}
          <button
            onClick={() => setScannerOpen(true)}
            disabled={uploading}
            className={`bg-cyan-600 text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-cyan-500 transition cursor-pointer ${uploading ? "opacity-50" : ""}`}
          >
            <span className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
              Scannen
            </span>
          </button>
          <label className={`bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition cursor-pointer ${uploading ? "opacity-50" : ""}`}>
            {uploading ? "Hochladen..." : "+ Datei hochladen"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-emerald-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">Gesamt Brutto</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">{formatCurrency(totalGross)}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-cyan-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">Gesamt Netto</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">{formatCurrency(totalNet)}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-orange-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">Gesamt USt</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">{formatCurrency(totalVat)}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-purple-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">Anthropic API Kosten</p>
          <p className="text-xl font-bold text-purple-400">{totalAnalysisCost.toFixed(4)} &euro;</p>
          <p className="text-xs text-gray-500">Monat: {monthlyAnalysisCost.toFixed(4)} &euro;</p>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suche nach Datei, Aussteller, Betrag..."
          className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-full sm:w-64"
        />
      </div>

      {/* Receipts Table */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projekt</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aussteller</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Netto</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">USt</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Konto</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zahlung</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {receipts.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-500">Noch keine Belege hochgeladen.</td></tr>
            )}
            {receipts.filter((r) => {
              if (!searchQuery) return true;
              const sq = searchQuery.toLowerCase();
              return r.file_name.toLowerCase().includes(sq)
                || (r.issuer || "").toLowerCase().includes(sq)
                || (r.purpose || "").toLowerCase().includes(sq)
                || String(r.amount_gross || "").includes(sq);
            }).map((r) => {
              const isEditing = editingId === r.id;
              const statusColor = r.analysis_status === "done" ? "text-emerald-400 bg-emerald-500/15"
                : r.analysis_status === "analyzing" ? "text-amber-400 bg-amber-500/15"
                : r.analysis_status === "error" ? "text-rose-400 bg-rose-500/15"
                : "text-gray-400 bg-gray-500/15";
              const statusLabel = r.analysis_status === "done" ? "Analysiert"
                : r.analysis_status === "analyzing" ? "Analysiert..."
                : r.analysis_status === "error" ? "Fehler"
                : "Ausstehend";

              return (
                <tr key={r.id} className="hover:bg-[var(--surface-hover)] transition" onDoubleClick={() => setEditingId(r.id)}>
                  <td className="px-3 py-3 text-sm">
                    {isEditing ? (
                      <input defaultValue={r.purpose || ""} onBlur={(e) => handleFieldUpdate(r.id, "purpose", e.target.value || null)} className={inputClass} placeholder="Projekt/Zweck" />
                    ) : (
                      <>
                        <span className="font-medium text-[var(--text-primary)] block">{r.purpose || r.file_name}</span>
                        {r.purpose && <span className="text-[10px] text-gray-500">{r.file_name}</span>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-400">
                    {isEditing ? (
                      <input type="date" defaultValue={r.invoice_date || ""} onBlur={(e) => handleFieldUpdate(r.id, "invoice_date", e.target.value || null)} className={inputClass} />
                    ) : (r.invoice_date || "—")}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-400">
                    {isEditing ? (
                      <input defaultValue={r.issuer || ""} onBlur={(e) => handleFieldUpdate(r.id, "issuer", e.target.value || null)} className={inputClass} />
                    ) : (r.issuer || "—")}
                  </td>
                  <td className="px-3 py-3 text-sm text-right text-gray-400">
                    {isEditing ? (
                      <input type="number" step="0.01" defaultValue={r.amount_net ?? ""} onBlur={(e) => handleFieldUpdate(r.id, "amount_net", e.target.value ? Number(e.target.value) : null)} className={inputClass + " w-20 text-right"} />
                    ) : (r.amount_net != null ? formatCurrency(r.amount_net) : "—")}
                  </td>
                  <td className="px-3 py-3 text-sm text-right">
                    {(() => {
                      const vatDetails = r.analysis_raw?.vat_details as Array<{rate: number; vat: number}> | undefined;
                      if (vatDetails && vatDetails.length > 1) {
                        return (
                          <div className="space-y-0.5">
                            {vatDetails.map((v, i) => (
                              <div key={i} className="text-[10px]">
                                <span className="text-orange-400">{formatCurrency(v.vat)}</span>
                                <span className="text-gray-500 ml-1">({v.rate}%)</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return (
                        <>
                          <span className="text-orange-400">{r.amount_vat != null ? formatCurrency(r.amount_vat) : "—"}</span>
                          {r.vat_rate != null && <span className="text-xs text-gray-500 ml-1">({r.vat_rate}%)</span>}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3 text-sm text-right font-medium text-[var(--text-primary)]">
                    {r.amount_gross != null ? formatCurrency(r.amount_gross) : "—"}
                  </td>
                  <td className="px-3 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <select defaultValue={r.account_debit || ""} onChange={(e) => {
                        const opt = ACCOUNT_OPTIONS.find(o => o.value === e.target.value);
                        handleFieldUpdate(r.id, "account_debit", e.target.value || null);
                        if (opt && opt.label) handleFieldUpdate(r.id, "account_label", opt.label.split(" ").slice(1).join(" ") || null);
                      }} className={inputClass + " w-36"}>
                        {ACCOUNT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span className="text-gray-400" title={r.account_label || ""}>
                        {r.account_debit ? `${r.account_debit}` : "—"}
                        {r.account_label && <span className="text-[10px] text-gray-500 block">{r.account_label}</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <select defaultValue={r.payment_method} onChange={(e) => handleFieldUpdate(r.id, "payment_method", e.target.value as PaymentMethod)} className={inputClass + " w-28"}>
                        {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span className="text-gray-400">{PAYMENT_METHOD_OPTIONS.find((o) => o.value === r.payment_method)?.label || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor} ${r.analysis_status === "error" ? "cursor-pointer" : ""}`}
                      onClick={() => {
                        if (r.analysis_status === "error" && r.analysis_raw) {
                          alert(`Analysefehler:\n${(r.analysis_raw as Record<string, string>).error || JSON.stringify(r.analysis_raw)}`);
                        }
                      }}
                      title={r.analysis_status === "error" ? "Klicke für Details" : ""}
                    >{statusLabel}</span>
                    {r.analysis_status === "error" && r.analysis_raw && (
                      <div className="text-[9px] text-rose-400/70 mt-0.5 max-w-[80px] truncate" title={String((r.analysis_raw as Record<string, string>).error || "")}>
                        {String((r.analysis_raw as Record<string, string>).error || "").substring(0, 30)}...
                      </div>
                    )}
                    {r.analysis_cost != null && r.analysis_cost > 0 && (
                      <div className="text-[9px] text-gray-500 mt-0.5">Analysekosten: {r.analysis_cost.toFixed(4)}&euro;</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="flex flex-col items-center gap-0.5">
                      {/* View receipt */}
                      <button onClick={() => handleViewReceipt(r)} className="text-[var(--accent)] hover:brightness-110 p-1" title="Beleg ansehen">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      {r.analysis_status !== "analyzing" && analyzing !== r.id && (
                        <button onClick={() => analyzeReceipt(r.id)} className="text-[var(--accent)] hover:brightness-110 p-1" title="KI-Analyse starten">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 12l4-4" /><path d="M16 4h4v4" />
                          </svg>
                        </button>
                      )}
                      {analyzing === r.id && <span className="text-xs text-amber-400 animate-pulse">Analysiert...</span>}
                      <button onClick={() => setEditingId(isEditing ? null : r.id)} className="text-gray-500 hover:text-[var(--text-secondary)] p-1" title="Bearbeiten">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="text-rose-500/60 hover:text-rose-400 p-1" title="Löschen">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600 mt-3">Doppelklick auf eine Zeile zum Bearbeiten der KI-analysierten Felder.</p>

      {/* Document Scanner Modal */}
      {scannerOpen && (
        <DocumentScannerModal
          onCapture={handleScanCapture}
          onCancel={() => setScannerOpen(false)}
        />
      )}

      {/* Capture Edit Modal */}
      {captureFile && (
        <ReceiptCaptureModal
          imageFile={captureFile}
          onSubmit={handleCaptureSubmit}
          onCancel={() => setCaptureFile(null)}
        />
      )}

      {/* Receipt Crop/View Modal */}
      {editReceiptUrl && (
        <ReceiptCaptureModal
          imageUrl={editReceiptUrl}
          editMode={true}
          onSaveCrop={handleSaveCrop}
          onCancel={() => { setEditReceiptId(null); setEditReceiptUrl(null); }}
        />
      )}
    </div>
  );
}
