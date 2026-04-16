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

interface Props {
  initialStart: Date;
  initialEnd: Date;
  quotes: Quote[];
  projectFreq: Map<string, number>;
  onCancel: () => void;
  onSubmit: (result: ModalResult) => Promise<void>;
}

function toInputTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function applyInputTime(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const next = new Date(base);
  next.setHours(h, m, 0, 0);
  return next;
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TimeCalendarCreateModal({ initialStart, initialEnd, quotes, projectFreq, onCancel, onSubmit }: Props) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [pickerTab, setPickerTab] = useState<PickerTab>("projekte");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const canSave = !!selectedLabel && durationMinutes > 0 && !submitting;

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
    try {
      await onSubmit({ start, end, project_label: selectedLabel, quote_id: selectedQuoteId, description });
    } finally {
      setSubmitting(false);
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
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Zeit nachtragen</h2>
          <button onClick={onCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Start</label>
              <input
                type="time"
                value={toInputTime(start)}
                onChange={(e) => setStart(applyInputTime(start, e.target.value))}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Ende</label>
              <input
                type="time"
                value={toInputTime(end)}
                onChange={(e) => setEnd(applyInputTime(end, e.target.value))}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
              />
            </div>
            <div className="pb-2 text-xs text-[var(--text-muted)] min-w-[3.5rem] text-right">
              {formatDuration(durationMinutes)}
            </div>
          </div>

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

        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
          >Abbrechen</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--brand-orange)] text-white hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >Speichern</button>
        </div>
      </div>
    </div>
  );
}
