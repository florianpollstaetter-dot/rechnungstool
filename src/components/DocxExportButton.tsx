"use client";

import { useState } from "react";

type ToastState = { type: "success" | "error"; message: string } | null;

interface DocxExportButtonProps {
  documentId: string;
  documentTitle: string;
  companyId: string;
}

export default function DocxExportButton({ documentId, documentTitle, companyId }: DocxExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/export-docx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Fehler ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${documentTitle.replace(/[^a-z0-9äöüß\s-]/gi, "")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("success", "DOCX erfolgreich heruntergeladen.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Export fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleExport}
        disabled={loading}
        className="flex items-center gap-2 bg-[var(--surface-hover)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition disabled:opacity-50 disabled:cursor-not-allowed"
        title="Als DOCX herunterladen"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Exportiere…</span>
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            <span>Als DOCX herunterladen</span>
          </>
        )}
      </button>

      {toast && (
        <div
          className={`absolute right-0 top-full mt-2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg whitespace-nowrap
            ${toast.type === "success"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
            }`}
        >
          {toast.type === "success" ? (
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
