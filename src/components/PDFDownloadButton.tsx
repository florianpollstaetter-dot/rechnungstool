"use client";

import { useEffect, useRef, useState } from "react";
import { Invoice, Quote, Customer, CompanySettings, EInvoiceFormat } from "@/lib/types";
import { updateInvoice } from "@/lib/db";

interface Props {
  invoice?: Invoice;
  quote?: Quote;
  customer: Customer;
  settings: CompanySettings;
  onPreview?: (blob: Blob) => void;
  onInvoiceUpdated?: () => void;
}

export default function PDFDownloadButton({ invoice, quote, customer, settings, onPreview, onInvoiceUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [eInvoiceLoading, setEInvoiceLoading] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);

  const eFormat = invoice?.e_invoice_format;
  const isEInvoice = eFormat === "zugferd" || eFormat === "xrechnung";
  // Suggest XRechnung for German customers with a Leitweg-ID (B2G), ZUGFeRD otherwise.
  const suggestedFormat: Exclude<EInvoiceFormat, "none"> =
    customer.country === "DE" && (customer.leitweg_id || "").trim() ? "xrechnung" : "zugferd";

  useEffect(() => {
    if (!createMenuOpen) return;
    function close(e: MouseEvent) {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setCreateMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [createMenuOpen]);

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

  async function handleCreateEInvoice(format: Exclude<EInvoiceFormat, "none">) {
    if (!invoice) return;
    setCreateMenuOpen(false);
    setEInvoiceLoading(true);
    setError(null);
    try {
      await updateInvoice(invoice.id, { e_invoice_format: format });
      onInvoiceUpdated?.();
      await runEInvoiceDownload(format);
    } catch (err) {
      console.error("E-Rechnung creation failed:", err);
      setError(`E-Rechnung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEInvoiceLoading(false);
    }
  }

  async function handleEInvoiceDownload() {
    if (!invoice || !isEInvoice) return;
    setEInvoiceLoading(true);
    setError(null);
    try {
      await runEInvoiceDownload(eFormat as Exclude<EInvoiceFormat, "none">);
    } catch (err) {
      console.error("E-Rechnung generation failed:", err);
      setError(`E-Rechnung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEInvoiceLoading(false);
    }
  }

  function formatValidationMessage(data: { error?: string; validation?: { errors: { message: string }[] } }): string {
    if (data.validation?.errors?.length) {
      const bullets = data.validation.errors.slice(0, 5).map((e) => `• ${e.message}`).join("\n");
      const more = data.validation.errors.length > 5 ? `\n…und ${data.validation.errors.length - 5} weitere` : "";
      return `E-Rechnung ist nicht EN-16931-konform:\n${bullets}${more}`;
    }
    return data.error || "Generation failed";
  }

  async function runEInvoiceDownload(format: Exclude<EInvoiceFormat, "none">) {
    if (!invoice) return;
    if (format === "xrechnung") {
      const res = await fetch("/api/einvoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatValidationMessage(data));

      const blob = new Blob([data.xml], { type: "application/xml" });
      triggerDownload(blob, `XRechnung_${invoice.invoice_number.replace(/\s/g, "_")}.xml`);
    } else {
      const pdfResult = await generateBlob();
      if (!pdfResult) throw new Error("PDF generation failed");

      const pdfArrayBuffer = await pdfResult.blob.arrayBuffer();
      const pdfBase64 = btoa(
        new Uint8Array(pdfArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const res = await fetch("/api/einvoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, pdfBase64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatValidationMessage(data));

      const zugferdBytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0));
      const blob = new Blob([zugferdBytes], { type: "application/pdf" });
      triggerDownload(blob, `ZUGFeRD_${invoice.invoice_number.replace(/\s/g, "_")}.pdf`);
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
            className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] disabled:opacity-50 transition"
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
        {isEInvoice && (
          <button
            onClick={handleEInvoiceDownload}
            disabled={eInvoiceLoading}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            {eInvoiceLoading
              ? "Wird erstellt..."
              : eFormat === "xrechnung"
              ? "XRechnung XML"
              : "ZUGFeRD PDF"}
          </button>
        )}
        {invoice && !isEInvoice && (
          <div className="relative" ref={createMenuRef}>
            <button
              onClick={() => setCreateMenuOpen((v) => !v)}
              disabled={eInvoiceLoading}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              {eInvoiceLoading ? "Wird erstellt..." : "E-Rechnung erstellen"}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {createMenuOpen && (
              <div className="absolute right-0 mt-1 w-72 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-50 overflow-hidden">
                <button
                  onClick={() => handleCreateEInvoice("zugferd")}
                  className={`w-full text-left px-3 py-2 hover:bg-[var(--surface-hover)] transition border-b border-[var(--border)] ${suggestedFormat === "zugferd" ? "bg-emerald-500/10" : ""}`}
                >
                  <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    ZUGFeRD (PDF/A-3)
                    {suggestedFormat === "zugferd" && <span className="text-[10px] text-emerald-400 font-medium">empfohlen</span>}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Hybrid-PDF mit eingebettetem XML — für B2B</div>
                </button>
                <button
                  onClick={() => handleCreateEInvoice("xrechnung")}
                  className={`w-full text-left px-3 py-2 hover:bg-[var(--surface-hover)] transition ${suggestedFormat === "xrechnung" ? "bg-emerald-500/10" : ""}`}
                >
                  <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    XRechnung (XML)
                    {suggestedFormat === "xrechnung" && <span className="text-[10px] text-emerald-400 font-medium">empfohlen</span>}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Reines XML — für öffentliche Auftraggeber (B2G)</div>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {error && <pre className="text-xs text-rose-400 max-w-md text-right whitespace-pre-wrap">{error}</pre>}
    </div>
  );
}
