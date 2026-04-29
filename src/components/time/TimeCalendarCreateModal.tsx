"use client";

import { useEffect, useState } from "react";
import { Quote } from "@/lib/types";
import { TabButton } from "@/components/TabButton";

const GENERAL_ITEMS = ["Daily", "Weekly", "Meeting Team", "Meeting Agentur", "Neues Projekt", "Briefing", "Administration", "E-Mails"];
const OTHER_ITEMS = ["Weiterbildung", "Reise", "Krankheit", "Urlaub", "Sonstiges"];

type PickerTab = "allgemein" | "projekte" | "other";

export interface ModalResult {
  start: Date;
  end: Date;
  project_label: string;
  quote_id: string | null;
  description: string;
}

export interface EditData {
  id: string;
  start: Date;
  end: Date;
  project_label: string;
  quote_id: string | null;
  description: string;
}

interface Props {
  initialStart: Date;
  initialEnd: Date;
  quotes: Quote[];
  projectFreq: Map<string, number>;
  editData?: EditData;
  onCancel: () => void;
  onSubmit: (result: ModalResult) => Promise<{ ok: boolean; error?: string }>;
  onDelete?: (id: string) => Promise<void>;
}

function toInputTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function combineDateTime(dateStr: string, hhmm: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0, 0);
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TimeCalendarCreateModal({ initialStart, initialEnd, quotes, projectFreq, editData, onCancel, onSubmit, onDelete }: Props) {
  const isEdit = !!editData;
  const [start, setStart] = useState(editData?.start ?? initialStart);
  const [end, setEnd] = useState(editData?.end ?? initialEnd);
  const [selectedLabel, setSelectedLabel] = useState(editData?.project_label ?? "");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(editData?.quote_id ?? null);
  const [description, setDescription] = useState(editData?.description ?? "");
  const [pickerTab, setPickerTab] = useState<PickerTab>("projekte");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // SCH-920 K2-M3+M4 — when the user types an end-time that's earlier than
  // start, treat it as crossing midnight and roll the end day forward by one.
  // Cap at 24h so a typo doesn't create a multi-day mega-entry.
  const startDateStr = toInputDate(start);
  function setStartTime(hhmm: string) {
    const next = combineDateTime(startDateStr, hhmm);
    setStart(next);
    // Keep end on or after start; if not, push end forward by 1 day (rollover).
    if (end.getTime() <= next.getTime()) {
      const e = new Date(next);
      e.setMinutes(e.getMinutes() + Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)));
      setEnd(e);
    }
  }
  function setEndTime(hhmm: string) {
    // Compose end on the same date as start, then roll forward if needed so
    // we always end strictly after start (over-midnight case).
    let next = combineDateTime(startDateStr, hhmm);
    if (next.getTime() <= start.getTime()) {
      next = new Date(next.getTime() + 24 * 60 * 60 * 1000);
    }
    // Cap at 24h after start.
    const cap = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    if (next.getTime() > cap.getTime()) next = cap;
    setEnd(next);
  }
  function setStartDate(dateStr: string) {
    if (!dateStr) return;
    const newStart = combineDateTime(dateStr, toInputTime(start));
    const offset = end.getTime() - start.getTime();
    setStart(newStart);
    setEnd(new Date(newStart.getTime() + offset));
  }

  const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const crossesMidnight = start.getDate() !== end.getDate() || start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear();
  const canSave = !!selectedLabel && durationMinutes > 0 && durationMinutes <= 24 * 60 && !submitting;

  function pickGeneral(label: string) { setSelectedLabel(label); setSelectedQuoteId(null); }
  function pickOther(label: string) { setSelectedLabel(label); setSelectedQuoteId(null); }
  function pickQuote(q: Quote) {
    const label = q.project_description || q.quote_number;
    setSelectedLabel(label);
    setSelectedQuoteId(q.id);
  }

  async function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await onSubmit({ start, end, project_label: selectedLabel, quote_id: selectedQuoteId, description });
      if (!result.ok) setSubmitError(result.error ?? "Speichern nicht möglich");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!editData || !onDelete) return;
    if (!window.confirm("Eintrag wirklich löschen?")) return;
    setDeleting(true);
    try {
      await onDelete(editData.id);
    } finally {
      setDeleting(false);
    }
  }

  const sortedQuotes = [...quotes].sort((a, b) =>
    (projectFreq.get(b.project_description || b.quote_number) || 0) -
    (projectFreq.get(a.project_description || a.quote_number) || 0),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{isEdit ? "Eintrag bearbeiten" : "Zeit nachtragen"}</h2>
          <button onClick={onCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* SCH-920 K2-M3 — explicit date field so over-midnight entries can
              be recorded without splitting them by hand */}
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Datum</label>
            <input
              type="date"
              value={startDateStr}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Start</label>
              <input
                type="time"
                value={toInputTime(start)}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">
                Ende{crossesMidnight ? " (+1 Tag)" : ""}
              </label>
              <input
                type="time"
                value={toInputTime(end)}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
              />
            </div>
            <div className="pb-2 text-xs text-[var(--text-muted)] min-w-[3.5rem] text-right">
              {formatDuration(durationMinutes)}
            </div>
          </div>
          {crossesMidnight && (
            <p className="text-[10px] text-[var(--brand-orange)] -mt-2">
              Eintrag läuft über Mitternacht — wird automatisch am {toInputDate(end)} fortgesetzt.
            </p>
          )}

          <div>
            <div className="flex gap-0.5 px-0.5 pb-1 border-b border-[var(--border)]">
              {([["allgemein", "Allgemein"], ["projekte", "Projekte"], ["other", "Other"]] as [PickerTab, string][]).map(([key, label]) => (
                <TabButton key={key} active={pickerTab === key} onClick={() => setPickerTab(key)}>{label}</TabButton>
              ))}
            </div>
            <div key={pickerTab} className="tab-content-enter flex flex-wrap gap-2 pt-3 pb-1 max-h-36 overflow-y-auto">
              {pickerTab === "allgemein" && GENERAL_ITEMS.map((item) => (
                <button
                  key={item}
                  onClick={() => pickGeneral(item)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${selectedLabel === item ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--brand-orange-dim)] hover:text-[var(--brand-orange)]"}`}
                >{item}</button>
              ))}
              {pickerTab === "projekte" && (
                sortedQuotes.length > 0
                  ? sortedQuotes.map((q) => {
                      const label = q.project_description || q.quote_number;
                      const isActive = selectedLabel === label && selectedQuoteId === q.id;
                      return (
                        <button
                          key={q.id}
                          onClick={() => pickQuote(q)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${isActive ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--brand-orange-dim)] hover:text-[var(--brand-orange)]"}`}
                        >{label}</button>
                      );
                    })
                  : <p className="text-xs text-[var(--text-muted)]">Keine freigegebenen Angebote.</p>
              )}
              {pickerTab === "other" && OTHER_ITEMS.map((item) => (
                <button
                  key={item}
                  onClick={() => pickOther(item)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${selectedLabel === item ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--brand-orange-dim)] hover:text-[var(--brand-orange)]"}`}
                >{item}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Beschreibung (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
              placeholder="Was wurde erledigt?"
              autoFocus
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
            />
          </div>
        </div>

        {submitError && (
          <div className="px-5 pb-2 -mt-2 text-[11px] text-rose-400">{submitError}</div>
        )}
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-between items-center gap-2">
          {/* SCH-920 K3-Q2 — delete button for erroneous entries */}
          <div>
            {isEdit && onDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 transition disabled:opacity-40"
              >{deleting ? "…" : "Löschen"}</button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >Abbrechen</button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--brand-orange)] text-white hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >{isEdit ? "Ändern" : "Speichern"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
