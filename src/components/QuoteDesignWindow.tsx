"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Quote,
  Customer,
  CompanySettings,
  QuoteDesignKey,
  QuoteDesignPhoto,
  QUOTE_DESIGN_OPTIONS,
} from "@/lib/types";
import {
  getDesignPhotos,
  uploadDesignPhoto,
  deleteDesignPhoto,
  getDesignPhotoUrl,
  getDesignSelection,
  upsertDesignSelection,
} from "@/lib/db";
import { useI18n } from "@/lib/i18n-context";

interface Props {
  quote: Quote;
  customer: Customer;
  settings: CompanySettings;
  onClose: () => void;
  onPreview: (blob: Blob) => void;
}

// Design preview thumbnails — CSS-based mini previews
const DESIGN_PREVIEWS: Record<QuoteDesignKey, { bg: string; accent: string; label: string }> = {
  classic: { bg: "#0A0A0A", accent: "#C9A84C", label: "Classic" },
  modern: { bg: "#FFFFFF", accent: "#1A56DB", label: "Modern" },
  minimal: { bg: "#FFFFFF", accent: "#1a1a1a", label: "Minimal" },
  bold: { bg: "#111111", accent: "#FF6B2B", label: "Bold" },
};

export default function QuoteDesignWindow({ quote, customer, settings, onClose, onPreview }: Props) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"designs" | "photos" | "ai">("designs");
  const [selectedDesign, setSelectedDesign] = useState<QuoteDesignKey>("classic");
  const [photos, setPhotos] = useState<QuoteDesignPhoto[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [displayMode, setDisplayMode] = useState(quote.display_mode);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [photosData, selection] = await Promise.all([
      getDesignPhotos(),
      getDesignSelection(quote.id),
    ]);
    setPhotos(photosData);
    if (selection) {
      setSelectedDesign(selection.design_key);
      setSelectedPhotoIds(selection.photo_ids);
    }
  }, [quote.id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleUpload(files: FileList) {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        await uploadDesignPhoto(file);
      }
      await loadData();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePhoto(id: string) {
    await deleteDesignPhoto(id);
    setSelectedPhotoIds((prev) => prev.filter((p) => p !== id));
    await loadData();
  }

  function togglePhotoSelection(id: string) {
    setSelectedPhotoIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await upsertDesignSelection(quote.id, selectedDesign, selectedPhotoIds);
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setPdfLoading(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { default: QuotePDFDesign } = await import("@/components/QuotePDFDesigns");

      let logoUrl = settings.logo_url;
      if (logoUrl && !logoUrl.startsWith("http")) {
        logoUrl = `${window.location.origin}${logoUrl}`;
      }
      const absSettings = { ...settings, logo_url: logoUrl || "" };

      const photoUrls = selectedPhotoIds
        .map((id) => photos.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => getDesignPhotoUrl(p!.file_path));

      const updatedQuote = { ...quote, display_mode: displayMode };

      const blob = await pdf(
        <QuotePDFDesign
          designKey={selectedDesign}
          quote={updatedQuote}
          customer={customer}
          settings={absSettings}
          photoUrls={photoUrls}
        />
      ).toBlob();

      onPreview(blob);
    } catch (err) {
      console.error("Preview failed:", err);
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiError(null);
    try {
      const res = await fetch("/api/generate-design-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, count: 1 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || "Generation failed");
      }
      const data = await res.json();
      if (data.images && data.images.length > 0) {
        // Reload photos — the API route saved them to the pool
        await loadData();
        setAiPrompt("");
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setAiGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-2xl w-[95vw] max-w-5xl h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {t("design.title")} — {quote.quote_number}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">{quote.project_description || customer.company || customer.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Display mode toggle */}
            <button
              onClick={() => setDisplayMode(displayMode === "simple" ? "detailed" : "simple")}
              className={`relative inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors ${
                displayMode === "simple" ? "bg-[var(--accent)] text-black" : "bg-gray-600 text-[var(--text-primary)]"
              }`}
            >
              {displayMode === "simple" ? t("design.simple") : t("design.detailed")}
            </button>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-2xl leading-none transition">&times;</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Tabs sidebar */}
          <div className="w-48 border-r border-[var(--border)] flex flex-col">
            <button
              onClick={() => setActiveTab("designs")}
              className={`text-left px-4 py-3 text-sm font-medium transition ${
                activeTab === "designs" ? "bg-[var(--accent)]/10 text-[var(--accent)] border-r-2 border-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {t("design.tabDesigns")}
            </button>
            <button
              onClick={() => setActiveTab("photos")}
              className={`text-left px-4 py-3 text-sm font-medium transition ${
                activeTab === "photos" ? "bg-[var(--accent)]/10 text-[var(--accent)] border-r-2 border-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {t("design.tabPhotos")}
              {selectedPhotoIds.length > 0 && (
                <span className="ml-2 text-xs bg-[var(--accent)] text-black rounded-full px-1.5 py-0.5">{selectedPhotoIds.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("ai")}
              className={`text-left px-4 py-3 text-sm font-medium transition ${
                activeTab === "ai" ? "bg-[var(--accent)]/10 text-[var(--accent)] border-r-2 border-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {t("design.tabAi")}
            </button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* ── Designs tab ── */}
            {activeTab === "designs" && (
              <div>
                <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">{t("design.chooseDesign")}</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {QUOTE_DESIGN_OPTIONS.map((opt) => {
                    const preview = DESIGN_PREVIEWS[opt.value];
                    const isSelected = selectedDesign === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedDesign(opt.value)}
                        className={`rounded-xl border-2 transition overflow-hidden ${
                          isSelected ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : "border-[var(--border)] hover:border-[var(--text-muted)]"
                        }`}
                      >
                        {/* Mini preview */}
                        <div className="aspect-[3/4] relative" style={{ backgroundColor: preview.bg }}>
                          {/* Decorative bars */}
                          <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: preview.accent }} />
                          <div className="absolute top-4 left-4 right-4 flex flex-col gap-1.5">
                            <div className="h-1 rounded-full opacity-30" style={{ backgroundColor: preview.accent, width: "40%" }} />
                            <div className="h-3 rounded-full opacity-20" style={{ backgroundColor: preview.bg === "#FFFFFF" ? "#000" : "#fff", width: "80%" }} />
                            <div className="h-1.5 rounded-full opacity-15" style={{ backgroundColor: preview.bg === "#FFFFFF" ? "#000" : "#fff", width: "60%" }} />
                          </div>
                          <div className="absolute bottom-3 left-4 right-4">
                            <div className="h-1 rounded-full opacity-10" style={{ backgroundColor: preview.bg === "#FFFFFF" ? "#000" : "#fff" }} />
                            <div className="h-1 rounded-full opacity-10 mt-1" style={{ backgroundColor: preview.bg === "#FFFFFF" ? "#000" : "#fff", width: "70%" }} />
                          </div>
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 bg-[var(--accent)] rounded-full flex items-center justify-center">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="p-2 bg-[var(--background)]">
                          <p className={`text-xs font-medium ${isSelected ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>
                            {preview.label}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Photos tab ── */}
            {activeTab === "photos" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("design.photoPool")}</h3>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => e.target.files && handleUpload(e.target.files)}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="bg-[var(--accent)] text-black px-3 py-1.5 rounded-lg text-sm font-medium hover:brightness-110 transition disabled:opacity-50"
                    >
                      {uploading ? t("common.uploading") : t("design.uploadPhotos")}
                    </button>
                  </div>
                </div>

                {photos.length === 0 ? (
                  <div className="text-center py-12 text-[var(--text-muted)]">
                    <p className="text-sm">{t("design.noPhotos")}</p>
                    <p className="text-xs mt-1">{t("design.noPhotosHint")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
                    {photos.map((photo) => {
                      const isSelected = selectedPhotoIds.includes(photo.id);
                      const url = getDesignPhotoUrl(photo.file_path);
                      return (
                        <div key={photo.id} className="relative group">
                          <button
                            onClick={() => togglePhotoSelection(photo.id)}
                            className={`rounded-lg overflow-hidden border-2 transition w-full aspect-[4/3] ${
                              isSelected ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : "border-[var(--border)] hover:border-[var(--text-muted)]"
                            }`}
                          >
                            <img src={url} alt={photo.alt_text || photo.file_name} className="w-full h-full object-cover" />
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-5 h-5 bg-[var(--accent)] rounded-full flex items-center justify-center">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            )}
                            {photo.ai_generated && (
                              <div className="absolute top-2 left-2 bg-purple-600/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">AI</div>
                            )}
                          </button>
                          <button
                            onClick={() => handleDeletePhoto(photo.id)}
                            className="absolute bottom-2 right-2 bg-rose-600/80 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition"
                            title={t("common.delete")}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            </svg>
                          </button>
                          <p className="text-[10px] text-[var(--text-muted)] mt-1 truncate">{photo.file_name}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── AI tab ── */}
            {activeTab === "ai" && (
              <div>
                <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">{t("design.aiTitle")}</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">{t("design.aiDescription")}</p>

                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={t("design.aiPlaceholder")}
                    className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    onKeyDown={(e) => e.key === "Enter" && handleAiGenerate()}
                    disabled={aiGenerating}
                  />
                  <button
                    onClick={handleAiGenerate}
                    disabled={aiGenerating || !aiPrompt.trim()}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-500 transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {aiGenerating ? t("design.aiGenerating") : t("design.aiGenerate")}
                  </button>
                </div>

                {aiError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 text-sm text-rose-400 mb-4">
                    {aiError}
                  </div>
                )}

                <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--text-muted)] mb-2">{t("design.aiExamples")}</p>
                  <div className="space-y-1.5">
                    {[
                      "Professional VR headset product shot, studio lighting, dark background",
                      "Modern office workspace with tech equipment, bright and clean",
                      "Abstract geometric pattern, blue and gold, corporate style",
                      "Trade show booth with interactive displays, wide angle",
                    ].map((example, idx) => (
                      <button
                        key={idx}
                        onClick={() => setAiPrompt(example)}
                        className="block text-left text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition"
                      >
                        &rarr; {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)]">
          <div className="text-sm text-[var(--text-muted)]">
            {t("design.selectedDesign")}: <span className="text-[var(--text-primary)] font-medium">{DESIGN_PREVIEWS[selectedDesign].label}</span>
            {selectedPhotoIds.length > 0 && (
              <span className="ml-3">{t("design.photosSelected", { count: String(selectedPhotoIds.length) })}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition disabled:opacity-50"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
            <button
              onClick={async () => { await handleSave(); await handlePreview(); }}
              disabled={pdfLoading || saving}
              className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
            >
              {pdfLoading ? t("common.loading") : t("design.preview")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
