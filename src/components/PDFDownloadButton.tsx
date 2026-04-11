"use client";

import { useState } from "react";
import { Invoice, Quote, Customer, CompanySettings } from "@/lib/types";

interface Props {
  invoice?: Invoice;
  quote?: Quote;
  customer: Customer;
  settings: CompanySettings;
  onPreview?: (blob: Blob) => void;
}

export default function PDFDownloadButton({ invoice, quote, customer, settings, onPreview }: Props) {
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateBlob(): Promise<{ blob: Blob; filename: string } | null> {
    const { pdf } = await import("@react-pdf/renderer");

    // Build absolute logo URL, handle empty/missing logo gracefully
    let logoUrl = settings.logo_url;
    if (logoUrl && !logoUrl.startsWith("http")) {
      logoUrl = `${window.location.origin}${logoUrl}`;
    }
    const absSettings = { ...settings, logo_url: logoUrl || "" };

    if (invoice) {
      const { default: InvoicePDF } = await import("@/components/InvoicePDF");
      const blob = await pdf(
        <InvoicePDF invoice={invoice} customer={customer} settings={absSettings} />
      ).toBlob();
      return { blob, filename: `Rechnung_${invoice.invoice_number.replace(/\s/g, "_")}.pdf` };
    } else if (quote) {
      const { default: QuotePDF } = await import("@/components/QuotePDF");
      const blob = await pdf(
        <QuotePDF quote={quote} customer={customer} settings={absSettings} />
      ).toBlob();
      return { blob, filename: `Angebot_${quote.quote_number.replace(/\s/g, "_")}.pdf` };
    }
    return null;
  }

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateBlob();
      if (result) triggerDownload(result.blob, result.filename);
    } catch (err) {
      console.error("PDF generation failed:", err);
      setError(`PDF-Erstellung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    if (!onPreview) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const result = await generateBlob();
      if (result) onPreview(result.blob);
    } catch (err) {
      console.error("PDF preview failed:", err);
      setError(`PDF-Vorschau fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPreviewLoading(false);
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {onPreview && (
          <button
            onClick={handlePreview}
            disabled={previewLoading}
            className="bg-[var(--surface-hover)] text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] disabled:opacity-50 transition"
          >
            {previewLoading ? "Laden..." : "Vorschau"}
          </button>
        )}
        <button
          onClick={handleDownload}
          disabled={loading}
          className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition"
        >
          {loading ? "Wird erstellt..." : "PDF herunterladen"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-400 max-w-xs text-right">{error}</p>}
    </div>
  );
}
