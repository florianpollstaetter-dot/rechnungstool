"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Quote,
  Customer,
  CompanySettings,
  QuoteDesignKey,
  QuoteDesignPhoto,
  QuoteDesignAIPayload,
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
import { useCompany } from "@/lib/company-context";

interface Props {
  quote: Quote;
  customer: Customer;
  settings: CompanySettings;
  onClose: () => void;
  onPreview: (blob: Blob) => void;
}

function previewDate(s: string): string {
  try {
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  } catch {
    return s;
  }
}

function previewEuro(n: number): string {
  return n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

interface PreviewProps {
  quote: Quote;
  customer: Customer;
  settings: CompanySettings;
}

// ── Classic ──────────────────────────────────────────────────────────────────
// Cream/white, gold accents, serif elegance

function ClassicPreview({ quote, customer, settings }: PreviewProps) {
  const clientName = (customer.company || customer.name).substring(0, 26);
  const title = (quote.project_description || "Projektangebot").substring(0, 34);
  const items = quote.items.slice(0, 4);
  return (
    <div
      className="w-full h-full overflow-hidden relative"
      style={{ backgroundColor: "#FEFEFE", fontFamily: "Georgia, serif" }}
    >
      {/* Gold top stripe */}
      <div style={{ height: 5, backgroundColor: "#C9A84C" }} />

      {/* Header */}
      <div
        style={{
          padding: "9px 14px 7px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "0.5px solid #E7E5E4",
        }}
      >
        {settings.logo_url ? (
          <img
            src={settings.logo_url}
            alt=""
            style={{ height: 18, maxWidth: 60, objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontSize: 7, fontWeight: 700, color: "#1C1917" }}>
            {settings.company_name || "Ihr Unternehmen"}
          </span>
        )}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 5, color: "#78716C" }}>{settings.company_name}</div>
          <div style={{ fontSize: 5, color: "#78716C" }}>
            {settings.zip} {settings.city}
          </div>
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: "10px 14px 8px" }}>
        <div
          style={{
            fontSize: 5,
            color: "#C9A84C",
            textTransform: "uppercase",
            letterSpacing: 2,
            marginBottom: 3,
          }}
        >
          ANGEBOT
        </div>
        <div style={{ height: 0.75, width: 20, backgroundColor: "#C9A84C", marginBottom: 5 }} />
        <div
          style={{
            fontSize: 8,
            fontWeight: 700,
            color: "#1C1917",
            lineHeight: 1.25,
            marginBottom: 5,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 5, color: "#78716C", marginBottom: 2 }}>für</div>
        <div style={{ fontSize: 7, fontWeight: 600, color: "#1C1917" }}>{clientName}</div>
      </div>

      {/* Info chips */}
      <div style={{ display: "flex", gap: 5, padding: "0 14px 8px" }}>
        {[
          { label: "Nr.", value: quote.quote_number },
          { label: "Datum", value: previewDate(quote.quote_date) },
          { label: "Gültig bis", value: previewDate(quote.valid_until) },
        ].map((chip, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: "5px 4px",
              backgroundColor: "#FBF5E6",
              border: "0.5px solid #C9A84C",
              borderTopWidth: 2,
              borderTopColor: "#C9A84C",
              textAlign: "center",
            }}
          >
            <div
              style={{ fontSize: 4, color: "#C9A84C", textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              {chip.label}
            </div>
            <div style={{ fontSize: 5.5, fontWeight: 600, color: "#1C1917", marginTop: 1 }}>
              {chip.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ margin: "0 14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            backgroundColor: "#C9A84C",
            padding: "3px 6px",
          }}
        >
          <span style={{ fontSize: 4.5, color: "#fff", fontWeight: 700 }}>Leistung</span>
          <span style={{ fontSize: 4.5, color: "#fff", fontWeight: 700 }}>Betrag</span>
        </div>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "3.5px 6px",
              borderBottom: "0.5px solid #E7E5E4",
              backgroundColor: i % 2 === 1 ? "#FAF9F7" : "transparent",
            }}
          >
            <span
              style={{
                fontSize: 4.5,
                color: "#1C1917",
                maxWidth: "62%",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {item.description}
            </span>
            <span style={{ fontSize: 4.5, color: "#78716C" }}>{previewEuro(item.total)}</span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            backgroundColor: "#1C1917",
            padding: "5px 6px",
            marginTop: 3,
          }}
        >
          <span style={{ fontSize: 5, fontWeight: 700, color: "#C9A84C" }}>GESAMT</span>
          <span style={{ fontSize: 5, fontWeight: 700, color: "#fff" }}>
            {previewEuro(quote.total)}
          </span>
        </div>
      </div>

      {/* Bottom gold stripe */}
      <div
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, backgroundColor: "#C9A84C" }}
      />
    </div>
  );
}

// ── Modern ───────────────────────────────────────────────────────────────────
// White, blue accents, card-based layout

function ModernPreview({ quote, customer, settings }: PreviewProps) {
  const clientName = (customer.company || customer.name).substring(0, 26);
  const title = (quote.project_description || "Projektangebot").substring(0, 34);
  const items = quote.items.slice(0, 4);
  return (
    <div
      className="w-full h-full overflow-hidden relative"
      style={{ backgroundColor: "#FFFFFF", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Blue top bar */}
      <div style={{ height: 5, backgroundColor: "#1A56DB" }} />

      {/* Header */}
      <div
        style={{
          padding: "8px 14px 6px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {settings.logo_url ? (
          <img
            src={settings.logo_url}
            alt=""
            style={{ height: 16, maxWidth: 56, objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontSize: 7, fontWeight: 700, color: "#111827" }}>
            {settings.company_name || "Ihr Unternehmen"}
          </span>
        )}
        <span style={{ fontSize: 5, color: "#6B7280" }}>
          {settings.zip} {settings.city}
        </span>
      </div>

      {/* Blue hero card */}
      <div
        style={{
          margin: "0 14px 8px",
          backgroundColor: "#E8EEFB",
          borderRadius: 4,
          padding: "8px 10px",
        }}
      >
        <div
          style={{
            fontSize: 4.5,
            color: "#1A56DB",
            textTransform: "uppercase",
            letterSpacing: 2,
            marginBottom: 3,
          }}
        >
          ANGEBOT
        </div>
        <div
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            color: "#111827",
            lineHeight: 1.2,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div style={{ height: 2, width: 24, backgroundColor: "#1A56DB", marginBottom: 5 }} />
        <div style={{ fontSize: 5, color: "#6B7280" }}>
          für:{" "}
          <span style={{ color: "#111827", fontWeight: 600 }}>{clientName}</span>
        </div>
      </div>

      {/* Info chips */}
      <div style={{ display: "flex", gap: 5, padding: "0 14px 8px" }}>
        {[
          { label: "Nr.", value: quote.quote_number },
          { label: "Datum", value: previewDate(quote.quote_date) },
          { label: "Gültig bis", value: previewDate(quote.valid_until) },
        ].map((chip, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              backgroundColor: "#F3F4F6",
              borderRadius: 3,
              padding: "5px 4px",
            }}
          >
            <div style={{ fontSize: 4, color: "#6B7280", textTransform: "uppercase" }}>
              {chip.label}
            </div>
            <div style={{ fontSize: 5.5, fontWeight: 600, color: "#111827", marginTop: 1 }}>
              {chip.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ margin: "0 14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            backgroundColor: "#111827",
            padding: "3px 6px",
            borderRadius: "3px 3px 0 0",
          }}
        >
          <span style={{ fontSize: 4.5, color: "#fff", fontWeight: 600 }}>Leistung</span>
          <span style={{ fontSize: 4.5, color: "#fff", fontWeight: 600 }}>Betrag</span>
        </div>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "3.5px 6px",
              borderBottom: "0.5px solid #E5E7EB",
              backgroundColor: i % 2 === 1 ? "#F9FAFB" : "#fff",
            }}
          >
            <span
              style={{
                fontSize: 4.5,
                color: "#111827",
                maxWidth: "62%",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {item.description}
            </span>
            <span style={{ fontSize: 4.5, color: "#6B7280" }}>{previewEuro(item.total)}</span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            backgroundColor: "#1A56DB",
            padding: "5px 6px",
            borderRadius: "0 0 3px 3px",
          }}
        >
          <span style={{ fontSize: 5, fontWeight: 700, color: "#fff" }}>GESAMT</span>
          <span style={{ fontSize: 5, fontWeight: 700, color: "#fff" }}>
            {previewEuro(quote.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Minimal ──────────────────────────────────────────────────────────────────
// Pure white, monochrome, editorial typography

function MinimalPreview({ quote, customer, settings }: PreviewProps) {
  const clientName = (customer.company || customer.name).substring(0, 26);
  const title = (quote.project_description || "Projektangebot").substring(0, 32);
  const items = quote.items.slice(0, 4);
  return (
    <div
      className="w-full h-full overflow-hidden"
      style={{ backgroundColor: "#FFFFFF", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Company */}
      <div style={{ padding: "12px 16px 6px" }}>
        {settings.logo_url ? (
          <img
            src={settings.logo_url}
            alt=""
            style={{ height: 14, maxWidth: 56, objectFit: "contain", marginBottom: 2 }}
          />
        ) : (
          <div style={{ fontSize: 6, fontWeight: 700, color: "#1a1a1a", marginBottom: 2 }}>
            {settings.company_name || "Ihr Unternehmen"}
          </div>
        )}
      </div>

      {/* Big ANGEBOT heading */}
      <div style={{ padding: "0 16px 8px" }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#1a1a1a",
            letterSpacing: -0.5,
            lineHeight: 1,
            marginBottom: 5,
          }}
        >
          ANGEBOT
        </div>
        <div style={{ height: 0.75, width: 20, backgroundColor: "#1a1a1a", marginBottom: 5 }} />
        <div style={{ fontSize: 6.5, color: "#999999", lineHeight: 1.4, marginBottom: 3 }}>
          {title}
        </div>
        <div style={{ fontSize: 7, fontWeight: 600, color: "#1a1a1a" }}>{clientName}</div>
      </div>

      {/* Metadata */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "4px 16px",
          borderTop: "0.5px solid #e0e0e0",
          borderBottom: "0.5px solid #e0e0e0",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 4, color: "#999" }}>Nr. {quote.quote_number}</span>
        <span style={{ fontSize: 4, color: "#999" }}>{previewDate(quote.quote_date)}</span>
        <span style={{ fontSize: 4, color: "#999" }}>bis {previewDate(quote.valid_until)}</span>
      </div>

      {/* Items */}
      <div style={{ padding: "0 16px" }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingTop: 3,
              paddingBottom: 3,
              borderBottom: "0.5px solid #e0e0e0",
            }}
          >
            <span
              style={{
                fontSize: 4.5,
                color: "#1a1a1a",
                maxWidth: "62%",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {item.description}
            </span>
            <span style={{ fontSize: 4.5, color: "#999" }}>{previewEuro(item.total)}</span>
          </div>
        ))}

        {/* Total */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: 5,
            marginTop: 1,
          }}
        >
          <span style={{ fontSize: 6, fontWeight: 700, color: "#1a1a1a" }}>Total</span>
          <span style={{ fontSize: 6, fontWeight: 700, color: "#1a1a1a" }}>
            {previewEuro(quote.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Bold ─────────────────────────────────────────────────────────────────────
// Deep teal top panel, white body, split layout

function BoldPreview({ quote, customer, settings }: PreviewProps) {
  const clientName = (customer.company || customer.name).substring(0, 24);
  const title = (quote.project_description || "Projektangebot").substring(0, 32);
  const items = quote.items.slice(0, 3);
  return (
    <div
      className="w-full h-full overflow-hidden"
      style={{ backgroundColor: "#FFFFFF", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Teal panel */}
      <div
        style={{ backgroundColor: "#0F5257", padding: "10px 14px 12px" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.15)",
              borderRadius: 3,
              padding: "2px 5px",
            }}
          >
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt=""
                style={{ height: 12, maxWidth: 48, objectFit: "contain" }}
              />
            ) : (
              <span style={{ fontSize: 5, fontWeight: 700, color: "#fff" }}>
                {settings.company_name || "Unternehmen"}
              </span>
            )}
          </div>
          <span style={{ fontSize: 4, color: "#AACECE" }}>
            {settings.zip} {settings.city}
          </span>
        </div>
        <div
          style={{
            fontSize: 4.5,
            color: "#AACECE",
            textTransform: "uppercase",
            letterSpacing: 2,
            marginBottom: 3,
          }}
        >
          ANGEBOT
        </div>
        <div
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.25,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 5, color: "#AACECE" }}>
          für:{" "}
          <span style={{ color: "#fff", fontWeight: 600 }}>{clientName}</span>
        </div>
      </div>

      {/* Info cards */}
      <div style={{ display: "flex", gap: 5, padding: "8px 14px 6px" }}>
        {[
          { label: "Nr.", value: quote.quote_number },
          { label: "Datum", value: previewDate(quote.quote_date) },
          { label: "Gültig bis", value: previewDate(quote.valid_until) },
        ].map((chip, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              backgroundColor: "#E8F4F4",
              borderTop: "2px solid #0F5257",
              padding: "4px 4px",
            }}
          >
            <div style={{ fontSize: 4, color: "#1A7A7A", textTransform: "uppercase" }}>
              {chip.label}
            </div>
            <div style={{ fontSize: 5.5, fontWeight: 700, color: "#0C1B1C", marginTop: 1 }}>
              {chip.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ margin: "0 14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            backgroundColor: "#0F5257",
            padding: "3px 6px",
            borderRadius: "3px 3px 0 0",
          }}
        >
          <span style={{ fontSize: 4.5, color: "#fff", fontWeight: 600 }}>Leistung</span>
          <span style={{ fontSize: 4.5, color: "#fff", fontWeight: 600 }}>Betrag</span>
        </div>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "3.5px 6px",
              borderBottom: "0.5px solid #E2E8F0",
              backgroundColor: i % 2 === 1 ? "#E8F4F4" : "#fff",
            }}
          >
            <span
              style={{
                fontSize: 4.5,
                color: "#0C1B1C",
                maxWidth: "62%",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {item.description}
            </span>
            <span style={{ fontSize: 4.5, color: "#0F5257", fontWeight: 600 }}>
              {previewEuro(item.total)}
            </span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            backgroundColor: "#0F5257",
            padding: "5px 6px",
            borderRadius: "0 0 3px 3px",
          }}
        >
          <span style={{ fontSize: 5, fontWeight: 700, color: "#fff" }}>GESAMT</span>
          <span style={{ fontSize: 5, fontWeight: 700, color: "#fff" }}>
            {previewEuro(quote.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── AI Custom ────────────────────────────────────────────────────────────────
// Live preview of the Opus 4.7-generated cover. Falls back to a placeholder
// hero when no payload is present yet (before the user clicks Generate).

function AiCustomPreview({ quote, customer, settings, aiPayload }: PreviewProps & { aiPayload: QuoteDesignAIPayload | null }) {
  const clientName = (customer.company || customer.name).substring(0, 26);
  const palette = aiPayload?.recommendedPalette;
  const accent = palette?.accent || "#6D28D9";
  const accentLight = palette?.accentLight || "#EDE9FE";
  const dark = palette?.dark || "#111827";
  const bg = palette?.bg || "#FFFFFF";

  const tagline = aiPayload?.coverTagline || (quote.language === "en" ? "PROPOSAL" : "ANGEBOT");
  const title = (aiPayload?.coverTitle || quote.project_description || (quote.language === "en" ? "AI Custom Quote" : "AI-generiertes Angebot")).substring(0, 38);
  const subtitle = (aiPayload?.coverSubtitle || (quote.language === "en" ? "Generate with Opus 4.7 for a tailor-made cover" : "Mit Opus 4.7 generieren für ein maßgeschneidertes Cover")).substring(0, 54);

  return (
    <div
      className="w-full h-full overflow-hidden relative"
      style={{ backgroundColor: bg, fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div style={{ height: 5, backgroundColor: accent }} />

      <div style={{ padding: "8px 14px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {settings.logo_url ? (
          <img src={settings.logo_url} alt="" style={{ height: 16, maxWidth: 56, objectFit: "contain" }} />
        ) : (
          <span style={{ fontSize: 7, fontWeight: 700, color: dark }}>{settings.company_name || "Ihr Unternehmen"}</span>
        )}
        <span style={{ fontSize: 5, color: "#6B7280" }}>{settings.zip} {settings.city}</span>
      </div>

      <div style={{ padding: "8px 14px 6px" }}>
        <div style={{ fontSize: 4.5, color: accent, textTransform: "uppercase", letterSpacing: 2, marginBottom: 3 }}>
          {tagline}
        </div>
        <div style={{ height: 1, width: 20, backgroundColor: accent, marginBottom: 5 }} />
        <div style={{ fontSize: 8.5, fontWeight: 700, color: dark, lineHeight: 1.22, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 5, color: "#6B7280", marginBottom: 5 }}>{subtitle}</div>
        <div style={{ fontSize: 5, color: "#6B7280" }}>
          {quote.language === "en" ? "for" : "für"}:{" "}
          <span style={{ color: dark, fontWeight: 600 }}>{clientName}</span>
        </div>
      </div>

      <div
        style={{
          margin: "0 14px 8px",
          backgroundColor: accentLight,
          borderLeft: `2px solid ${accent}`,
          padding: "6px 8px",
          fontSize: 4.5,
          color: dark,
          lineHeight: 1.55,
          maxHeight: 44,
          overflow: "hidden",
        }}
      >
        {aiPayload?.introText || (quote.language === "en"
          ? "After you click Generate, Opus 4.7 will compose a cover title, subtitle, tagline, and an opening paragraph tailored to this customer and project."
          : "Nach Klick auf Generieren entwirft Opus 4.7 einen maßgeschneiderten Cover-Titel, Subtitel, Tagline und Einleitungsabsatz für diesen Kunden und dieses Projekt.")}
      </div>

      <div style={{ display: "flex", gap: 5, padding: "0 14px 8px" }}>
        {[
          { label: "Nr.", value: quote.quote_number },
          { label: "Datum", value: previewDate(quote.quote_date) },
          { label: "Gültig", value: previewDate(quote.valid_until) },
        ].map((chip, i) => (
          <div key={i} style={{ flex: 1, backgroundColor: accentLight, borderTop: `2px solid ${accent}`, padding: "4px 4px" }}>
            <div style={{ fontSize: 4, color: accent, textTransform: "uppercase" }}>{chip.label}</div>
            <div style={{ fontSize: 5.5, fontWeight: 700, color: dark, marginTop: 1 }}>{chip.value}</div>
          </div>
        ))}
      </div>

      {!aiPayload && (
        <div style={{ position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center", fontSize: 5, color: "#9333EA", fontWeight: 600 }}>
          ⚡ Opus 4.7
        </div>
      )}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, backgroundColor: accent }} />
    </div>
  );
}

const DESIGN_LABELS: Record<QuoteDesignKey, { label: string; tagline: string }> = {
  classic:   { label: "Classic",   tagline: "Gold · Elegant · Zeitlos" },
  modern:    { label: "Modern",    tagline: "Blau · Klar · Strukturiert" },
  minimal:   { label: "Minimal",   tagline: "Monochrom · Editorial · Clean" },
  bold:      { label: "Bold",      tagline: "Teal · Kontrast · Professionell" },
  ai_custom: { label: "AI Custom", tagline: "Opus 4.7 · Maßgeschneidert" },
};

const PREVIEW_COMPONENTS: Record<Exclude<QuoteDesignKey, "ai_custom">, React.ComponentType<PreviewProps>> = {
  classic: ClassicPreview,
  modern:  ModernPreview,
  minimal: MinimalPreview,
  bold:    BoldPreview,
};

export default function QuoteDesignWindow({ quote, customer, settings, onClose, onPreview }: Props) {
  const { t } = useI18n();
  const { company } = useCompany();
  const [activeTab, setActiveTab] = useState<"designs" | "photos" | "ai">("designs");
  const [selectedDesign, setSelectedDesign] = useState<QuoteDesignKey>("classic");
  const [photos, setPhotos] = useState<QuoteDesignPhoto[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [displayMode, setDisplayMode] = useState(quote.display_mode);
  const [aiDesignPayload, setAiDesignPayload] = useState<QuoteDesignAIPayload | null>(null);
  const [aiDesignBusy, setAiDesignBusy] = useState(false);
  const [aiDesignError, setAiDesignError] = useState<string | null>(null);
  const [aiDesignWarn, setAiDesignWarn] = useState<string | null>(null);
  const [aiBrandTone, setAiBrandTone] = useState<"professional" | "warm" | "bold" | "minimal" | "playful" | "luxurious">("professional");
  const [aiIndustry, setAiIndustry] = useState("");
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
      setAiDesignPayload(selection.ai_generated_payload ?? null);
    }
  }, [quote.id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleUpload(files: FileList) {
    setUploading(true);
    setUploadError(null);
    try {
      const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) {
        setUploadError(t("design.uploadNoImages"));
        return;
      }
      for (const file of images) {
        await uploadDesignPhoto(file);
      }
      await loadData();
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      await upsertDesignSelection(quote.id, selectedDesign, selectedPhotoIds, aiDesignPayload);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateAiDesign() {
    setAiDesignBusy(true);
    setAiDesignError(null);
    setAiDesignWarn(null);
    try {
      const res = await fetch("/api/generate-quote-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.id,
          customer: {
            name: customer.name,
            company: customer.company,
            city: customer.city,
            country: customer.country,
          },
          industry: aiIndustry.trim() || undefined,
          projectDescription: quote.project_description || undefined,
          brandTone: aiBrandTone,
          language: quote.language || "de",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.payload) {
        setAiDesignPayload(null);
        // SCH-562: fallback → Minimal + warn
        setSelectedDesign("minimal");
        setAiDesignWarn(
          data?.error
            ? `${data.error}${" "}— using Minimal template as fallback.`
            : "AI design generation failed. Using Minimal template as fallback.",
        );
        return;
      }
      setAiDesignPayload(data.payload as QuoteDesignAIPayload);
    } catch (err) {
      setAiDesignPayload(null);
      setSelectedDesign("minimal");
      setAiDesignError(err instanceof Error ? err.message : "AI design generation failed");
    } finally {
      setAiDesignBusy(false);
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
          aiPayload={aiDesignPayload}
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
        body: JSON.stringify({ prompt: aiPrompt, count: 1, companyId: company.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || "Generation failed");
      }
      const data = await res.json();
      if (data.images && data.images.length > 0) {
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
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
                  {QUOTE_DESIGN_OPTIONS.map((opt) => {
                    const meta = DESIGN_LABELS[opt.value];
                    const isSelected = selectedDesign === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedDesign(opt.value)}
                        className={`rounded-xl border-2 transition overflow-hidden flex flex-col ${
                          isSelected
                            ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30 shadow-lg"
                            : "border-[var(--border)] hover:border-[var(--text-muted)] hover:shadow-md"
                        }`}
                      >
                        {/* Live mini-preview */}
                        <div className="aspect-[3/4] relative w-full overflow-hidden">
                          {opt.value === "ai_custom" ? (
                            <AiCustomPreview quote={quote} customer={customer} settings={settings} aiPayload={aiDesignPayload} />
                          ) : (
                            (() => {
                              const PreviewComponent = PREVIEW_COMPONENTS[opt.value];
                              return <PreviewComponent quote={quote} customer={customer} settings={settings} />;
                            })()
                          )}
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-6 h-6 bg-[var(--accent)] rounded-full flex items-center justify-center shadow-md z-10">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                          {opt.value === "ai_custom" && (
                            <div className="absolute top-2 left-2 bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10">
                              OPUS 4.7
                            </div>
                          )}
                        </div>
                        {/* Label */}
                        <div className="p-2.5 bg-[var(--background)] flex-1 text-left">
                          <p className={`text-sm font-semibold ${isSelected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>
                            {meta.label}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{meta.tagline}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedDesign === "ai_custom" && (
                  <div className="mt-6 bg-[var(--background)] border border-purple-500/40 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">AI Custom Cover & Intro</h4>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          Opus 4.7 composes a bespoke cover page (title, subtitle, tagline, palette) and an opener paragraph for this specific quote.
                        </p>
                      </div>
                      <button
                        onClick={handleGenerateAiDesign}
                        disabled={aiDesignBusy}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-500 transition disabled:opacity-60 whitespace-nowrap"
                      >
                        {aiDesignBusy
                          ? (quote.language === "en" ? "Generating..." : "Generiere...")
                          : aiDesignPayload
                            ? (quote.language === "en" ? "Regenerate" : "Neu generieren")
                            : (quote.language === "en" ? "Generate" : "Generieren")}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Brand tone</label>
                        <select
                          value={aiBrandTone}
                          onChange={(e) => setAiBrandTone(e.target.value as typeof aiBrandTone)}
                          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)]"
                        >
                          <option value="professional">professional</option>
                          <option value="warm">warm</option>
                          <option value="bold">bold</option>
                          <option value="minimal">minimal</option>
                          <option value="playful">playful</option>
                          <option value="luxurious">luxurious</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Industry (optional)</label>
                        <input
                          type="text"
                          value={aiIndustry}
                          onChange={(e) => setAiIndustry(e.target.value)}
                          placeholder={quote.language === "en" ? "e.g. VR events, real estate" : "z.B. VR-Events, Immobilien"}
                          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)]"
                        />
                      </div>
                    </div>

                    {aiDesignPayload && (
                      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--text-secondary)] space-y-1">
                        <div><span className="text-[var(--text-muted)]">Title:</span> <span className="text-[var(--text-primary)] font-medium">{aiDesignPayload.coverTitle}</span></div>
                        <div><span className="text-[var(--text-muted)]">Subtitle:</span> {aiDesignPayload.coverSubtitle}</div>
                        <div><span className="text-[var(--text-muted)]">Tagline:</span> {aiDesignPayload.coverTagline}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--text-muted)]">Accent:</span>
                          <span className="inline-block w-4 h-4 rounded border border-[var(--border)]" style={{ backgroundColor: aiDesignPayload.accentColor }} />
                          <code className="text-[var(--text-primary)]">{aiDesignPayload.accentColor}</code>
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)] mt-2">
                          {aiDesignPayload.model} · in {aiDesignPayload.inputTokens} / out {aiDesignPayload.outputTokens} / cached {aiDesignPayload.cachedInputTokens} tokens · ${aiDesignPayload.costUSD.toFixed(4)} USD
                        </div>
                      </div>
                    )}

                    {aiDesignError && (
                      <div className="mt-3 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-xs text-rose-400">
                        {aiDesignError}
                      </div>
                    )}
                    {aiDesignWarn && (
                      <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-400">
                        {aiDesignWarn}
                      </div>
                    )}
                  </div>
                )}
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

                {uploadError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 text-sm text-rose-400 mb-4">
                    {uploadError}
                  </div>
                )}

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
            {t("design.selectedDesign")}: <span className="text-[var(--text-primary)] font-medium">{DESIGN_LABELS[selectedDesign].label}</span>
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
