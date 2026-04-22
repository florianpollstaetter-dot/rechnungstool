"use client";

import { useMemo, useState } from "react";
import { CompanySettings } from "@/lib/types";
import { updateSettings } from "@/lib/db";

interface ValidationIssue {
  code: string;
  rule: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}

interface Props {
  errors: ValidationIssue[];
  settings: CompanySettings;
  onSaved: () => void; // retry generation after save
  onClose: () => void;
}

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

type SellerFieldKey =
  | "company_name"
  | "address"
  | "city"
  | "zip"
  | "country"
  | "uid"
  | "iban"
  | "bic"
  | "phone"
  | "email";

type SellerPatch = Partial<Pick<CompanySettings, SellerFieldKey>>;

const FIELD_LABELS: Record<SellerFieldKey, string> = {
  company_name: "Firmenname",
  address: "Straße + Hausnummer",
  city: "Ort",
  zip: "PLZ",
  country: "Land (ISO-2, z.B. AT)",
  uid: "UID-Nummer (z.B. ATU12345678)",
  iban: "IBAN",
  bic: "BIC",
  phone: "Telefon",
  email: "E-Mail",
};

const SELLER_FIELD_ORDER: SellerFieldKey[] = [
  "company_name",
  "address",
  "zip",
  "city",
  "country",
  "uid",
  "iban",
  "bic",
  "email",
  "phone",
];

// BT-path → company_settings column. Validator emits paths like "settings.address".
function sellerKeyFromPath(path: string): SellerFieldKey | null {
  if (!path.startsWith("settings.")) return null;
  const key = path.slice("settings.".length);
  if ((SELLER_FIELD_ORDER as string[]).includes(key)) return key as SellerFieldKey;
  return null;
}

export default function EInvoiceValidationModal({ errors, settings, onSaved, onClose }: Props) {
  // Group errors.
  const sellerErrorKeys = useMemo(() => {
    const keys = new Set<SellerFieldKey>();
    for (const e of errors) {
      const k = sellerKeyFromPath(e.path);
      if (k) keys.add(k);
    }
    return keys;
  }, [errors]);

  const nonSellerErrors = useMemo(
    () => errors.filter((e) => sellerKeyFromPath(e.path) === null),
    [errors]
  );

  // Form state: seed from current settings so the user only has to fill blanks.
  const [form, setForm] = useState<SellerPatch>(() => {
    const initial: SellerPatch = {};
    for (const k of SELLER_FIELD_ORDER) {
      initial[k] = (settings[k] as string) || "";
    }
    return initial;
  });

  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<
    { confidence: string; source: string; cost_eur?: number } | null
  >(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function setField(key: SellerFieldKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAiComplete() {
    const searchName = (form.company_name || settings.company_name || "").trim();
    if (!searchName) {
      setAiResult({ confidence: "error", source: "Bitte zuerst den Firmennamen eintragen." });
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch("/api/company/ai-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: searchName }),
      });
      const data = await res.json();
      if (data.success && data.company) {
        setForm((prev) => {
          const updated = { ...prev };
          for (const key of SELLER_FIELD_ORDER) {
            // Only fill empty fields so we never overwrite user edits.
            if (!updated[key] && data.company[key]) {
              updated[key] = data.company[key];
            }
          }
          return updated;
        });
        setAiResult({
          confidence: data.confidence,
          source: data.source,
          cost_eur: data.cost?.cost_eur,
        });
      } else {
        setAiResult({ confidence: "error", source: data.error || "AI-Abfrage fehlgeschlagen." });
      }
    } catch (err) {
      setAiResult({
        confidence: "error",
        source: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveAndRetry() {
    setSaving(true);
    setSaveError(null);
    try {
      // Only send fields whose value actually changed — avoids sending stale
      // defaults (e.g. bic: "") back to the server as an "update".
      const patch: SellerPatch = {};
      for (const k of SELLER_FIELD_ORDER) {
        const next = (form[k] || "").trim();
        if (next !== ((settings[k] as string) || "")) {
          patch[k] = next;
        }
      }
      if (Object.keys(patch).length > 0) {
        await updateSettings(patch);
      }
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              E-Rechnung: Unternehmensdaten unvollständig
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              EN 16931 verlangt für den Verkäufer Adresse, UID und IBAN. Bitte ergänzen oder per AI vervollständigen.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-[var(--text-primary)] text-2xl leading-none transition"
            aria-label="Schließen"
          >
            &times;
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* AI-Complete row */}
          <div className="flex items-center justify-between gap-4 bg-[var(--background)] rounded-lg px-4 py-3 border border-[var(--border)]">
            <div className="text-sm text-[var(--text-secondary)]">
              AI sucht deine Firma im Firmenbuch / WKO / Impressum und füllt leere Felder.
            </div>
            <button
              onClick={handleAiComplete}
              disabled={aiLoading}
              className="shrink-0 bg-[var(--accent)] text-black px-3 py-1.5 rounded-md text-xs font-semibold hover:brightness-110 disabled:opacity-50 transition"
            >
              {aiLoading ? "Sucht …" : "Mit AI vervollständigen"}
            </button>
          </div>

          {aiResult && (
            <div
              className={`text-xs rounded-md px-3 py-2 border ${
                aiResult.confidence === "error"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              }`}
            >
              {aiResult.confidence === "error" ? (
                <>Fehler: {aiResult.source}</>
              ) : (
                <>
                  Konfidenz: <b>{aiResult.confidence}</b> · Quelle: {aiResult.source}
                  {typeof aiResult.cost_eur === "number" ? ` · Kosten: €${aiResult.cost_eur.toFixed(4)}` : ""}
                </>
              )}
            </div>
          )}

          {/* Seller form — highlight fields referenced by errors */}
          <div className="grid grid-cols-2 gap-3">
            {SELLER_FIELD_ORDER.map((key) => {
              const isMissing = sellerErrorKeys.has(key);
              return (
                <div key={key} className={key === "company_name" || key === "address" ? "col-span-2" : ""}>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {FIELD_LABELS[key]}
                    {isMissing && <span className="text-rose-400 ml-1">·</span>}
                  </label>
                  <input
                    type="text"
                    value={form[key] || ""}
                    onChange={(e) => setField(key, e.target.value)}
                    className={`${inputClass} ${isMissing ? "border-rose-500/50" : ""}`}
                    placeholder={FIELD_LABELS[key]}
                  />
                </div>
              );
            })}
          </div>

          {/* Non-seller errors (customer/invoice fields) */}
          {nonSellerErrors.length > 0 && (
            <div className="text-xs rounded-md px-3 py-2 border border-amber-500/40 bg-amber-500/10 text-amber-200">
              <div className="font-medium mb-1">
                Weitere Fehler (bitte im Kunden- oder Rechnungsformular beheben):
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {nonSellerErrors.map((e) => (
                  <li key={e.code + e.path}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {saveError && (
            <div className="text-xs rounded-md px-3 py-2 border border-rose-500/40 bg-rose-500/10 text-rose-300">
              Speichern fehlgeschlagen: {saveError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSaveAndRetry}
            disabled={saving}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            {saving ? "Speichert …" : "Speichern & E-Rechnung erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}
