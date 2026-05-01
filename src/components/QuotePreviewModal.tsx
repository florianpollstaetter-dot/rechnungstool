"use client";

import { useEffect, useState } from "react";
import { Quote, Customer, CompanySettings, DisplayMode } from "@/lib/types";
import { useI18n } from "@/lib/i18n-context";

// SCH-956 K3-Y1 — Vollbild-PDF-Vorschau mit Simple/Detail-Toggle und
// Download. Toggle re-rendert clientseitig (kein Server-Roundtrip).

interface Props {
  quote: Quote;
  customer: Customer;
  settings: CompanySettings;
  initialMode?: DisplayMode;
  onClose: () => void;
}

export default function QuotePreviewModal({
  quote,
  customer,
  settings,
  initialMode,
  onClose,
}: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<DisplayMode>(initialMode ?? quote.display_mode);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function generate() {
      setGenerating(true);
      try {
        const { pdf } = await import("@react-pdf/renderer");
        const { default: QuotePDF } = await import("@/components/QuotePDF");
        let logoUrl = settings.logo_url;
        if (logoUrl && !logoUrl.startsWith("http")) {
          logoUrl = `${window.location.origin}${logoUrl}`;
        }
        const absSettings = { ...settings, logo_url: logoUrl || "" };
        const quoteWithMode: Quote = { ...quote, display_mode: mode };
        const newBlob = await pdf(
          <QuotePDF quote={quoteWithMode} customer={customer} settings={absSettings} />,
        ).toBlob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(newBlob);
        setBlob(newBlob);
        setUrl(objectUrl);
      } catch (err) {
        console.error("PDF preview generation failed:", err);
      } finally {
        if (!cancelled) setGenerating(false);
      }
    }

    generate();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mode, quote, customer, settings]);

  function handleDownload() {
    if (!blob) return;
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = `Angebot_${quote.quote_number.replace(/\s/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(dlUrl);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] w-[95vw] h-[95vh] max-w-6xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] gap-4 flex-wrap">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {t("quotes.preview")}
          </h2>

          <div
            className="flex items-center gap-1 rounded-lg bg-[var(--background)] p-1"
            role="group"
            aria-label={t("quoteNew.displayMode")}
          >
            <button
              type="button"
              onClick={() => setMode("simple")}
              aria-pressed={mode === "simple"}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                mode === "simple"
                  ? "bg-[var(--accent)] text-black"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t("quoteNew.displaySimple")}
            </button>
            <button
              type="button"
              onClick={() => setMode("detailed")}
              aria-pressed={mode === "detailed"}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                mode === "detailed"
                  ? "bg-[var(--accent)] text-black"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t("quoteNew.displayDetailed")}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!blob || generating}
              className="bg-[var(--accent)] text-black px-3 py-1.5 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition"
            >
              {t("quotes.pdfDownload")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-[var(--text-primary)] text-2xl leading-none transition px-2"
              aria-label={t("common.close")}
            >
              &times;
            </button>
          </div>
        </div>
        <div className="flex-1 p-4 relative">
          {generating && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10 rounded-lg pointer-events-none">
              <div className="bg-[var(--surface)] px-4 py-2 rounded-lg text-sm text-[var(--text-primary)] border border-[var(--border)]">
                {t("common.loading")}
              </div>
            </div>
          )}
          {url ? (
            <iframe
              src={url}
              className="w-full h-full rounded-lg border border-[var(--border)]"
              title={t("quotes.preview")}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
              {t("common.loading")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
