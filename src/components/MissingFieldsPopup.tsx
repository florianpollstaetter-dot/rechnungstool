"use client";

// SCH-960 — Fallback popup für Felder, die die AI nach allen Pässen nicht
// finden konnte. Wird von CustomerCreateModal und AiCompanySetup geöffnet,
// wenn /api/.../ai-complete eine non-empty `missingFields` zurückgibt.
//
// UX-konsistent zu EInvoiceValidationModal: gleiche Klassen, accent / surface,
// rosa Highlight für noch leere Required-Felder.

import { useEffect, useState } from "react";

export interface MissingFieldSpec {
  /** Schlüssel im Form-State des Aufrufers (z.B. "iban"). */
  key: string;
  /** Anzeigelabel (z.B. "IBAN"). */
  label: string;
  /** Optional: Platzhalter / Beispielformat. */
  placeholder?: string;
  /** Optional: kurzer Hinweis unter dem Eingabefeld. */
  hint?: string;
}

interface Props {
  /** Felder, die die AI nicht selbst befüllen konnte. */
  fields: MissingFieldSpec[];
  /** Bereits bekannte Werte (z.B. wenn der User schon manuell etwas eingetragen hat). */
  initialValues?: Record<string, string>;
  /** Vom Aufrufer angezeigter Titel. */
  title?: string;
  /** Optionaler Hinweistext oberhalb der Felder. */
  intro?: string;
  /** Wird mit den finalen Werten aufgerufen, wenn der User auf "Übernehmen" klickt. */
  onSubmit: (values: Record<string, string>) => void;
  /** Schließen ohne speichern (Felder bleiben leer). */
  onClose: () => void;
  /** Optional: Beschriftung des primären Buttons (Default: "Übernehmen"). */
  submitLabel?: string;
}

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

export default function MissingFieldsPopup({
  fields,
  initialValues = {},
  title = "Fehlende Felder",
  intro,
  onSubmit,
  onClose,
  submitLabel = "Übernehmen",
}: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of fields) seed[f.key] = initialValues[f.key] || "";
    return seed;
  });

  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    // Trim each value before handing back; caller decides what to do with empties.
    const trimmed: Record<string, string> = {};
    for (const f of fields) trimmed[f.key] = (values[f.key] || "").trim();
    onSubmit(trimmed);
  }

  // Primary action stays enabled even if some fields are empty — user may
  // legitimately not have a value (e.g. private IBAN). The required
  // semantics belong to the caller's downstream save/validate step.
  const filledCount = fields.reduce(
    (n, f) => n + ((values[f.key] || "").trim() ? 1 : 0),
    0,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Die AI konnte diese Felder nicht aus öffentlichen Quellen ermitteln. Bitte ergänze sie hier.
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

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {intro && (
            <div className="text-xs rounded-md px-3 py-2 border border-amber-500/40 bg-amber-500/10 text-amber-200">
              {intro}
            </div>
          )}

          {fields.map((f) => {
            const isEmpty = !values[f.key]?.trim();
            return (
              <div key={f.key}>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {f.label}
                </label>
                <input
                  type="text"
                  value={values[f.key] || ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder || f.label}
                  className={`${inputClass} ${isEmpty ? "border-rose-500/40" : ""}`}
                  autoFocus={f === fields[0]}
                />
                {f.hint && (
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">{f.hint}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--text-muted)]">
            {filledCount}/{fields.length} ausgefüllt
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSubmit}
              className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
