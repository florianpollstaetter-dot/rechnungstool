"use client";

// SCH-921 K2-J2 / K2-J3 — App-consistent "Neues Projekt" popup.
// Used both from the projects page and inline from the time calendar
// (K3-Q1) so a user can create a project on the fly without leaving the
// Zeiterfassung. Style mirrors TimeCalendarCreateModal: dark surface,
// orange accent, mobile-friendly.

import { useEffect, useMemo, useState } from "react";
import { Project, Quote } from "@/lib/types";
import { createProject, createProjectFromQuote, updateProject } from "@/lib/db";

interface Props {
  /** Quotes the user might want to attach. Caller filters as needed; we
   *  surface only those without a project_id (K2-J3). */
  quotes: Quote[];
  /** Projects already created (used to filter quotes that already have one). */
  existingProjects: Project[];
  onCancel: () => void;
  onCreated: (project: Project) => void;
}

export default function NewProjectModal({ quotes, existingProjects, onCancel, onCreated }: Props) {
  const [name, setName] = useState("");
  const [isBillable, setIsBillable] = useState(true);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // K2-J3 — only quotes that don't yet have a project. Server-side
  // `createProjectFromQuote` is idempotent so a duplicate would no-op,
  // but hiding them here keeps the UI honest.
  const linkedQuoteIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of existingProjects) if (p.quote_id) s.add(p.quote_id);
    return s;
  }, [existingProjects]);

  const availableQuotes = useMemo(
    () => quotes.filter((q) => !linkedQuoteIds.has(q.id)),
    [quotes, linkedQuoteIds],
  );

  // When a quote is selected, prefill the project name with its
  // project_description (or quote_number) so the user sees what gets
  // created and can still tweak it before saving.
  useEffect(() => {
    if (!selectedQuoteId) return;
    const q = availableQuotes.find((qt) => qt.id === selectedQuoteId);
    if (q) {
      const proposed = (q.project_description?.trim() || `Angebot ${q.quote_number}`);
      setName(proposed);
      setIsBillable(true); // quote-linked projects default to billable
    }
  }, [selectedQuoteId, availableQuotes]);

  const canSave = name.trim().length > 0 && !submitting;

  async function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      let project: Project;
      if (selectedQuoteId) {
        // Quote-linked path — reuse the existing quote→project pipeline so
        // tasks + budget come along automatically. After creation, patch
        // the name + is_billable to honour the user's overrides.
        project = await createProjectFromQuote(selectedQuoteId);
        const patch: Partial<Project> = {};
        if (name.trim() !== project.name) patch.name = name.trim();
        if (project.is_billable !== isBillable) patch.is_billable = isBillable;
        if (Object.keys(patch).length > 0) {
          project = await updateProject(project.id, patch);
        }
      } else {
        // Pure manual project — no quote, no tasks, no budget.
        project = await createProject({
          name: name.trim(),
          color: null,
          status: "active",
          quote_id: null,
          budget_hours: null,
          is_billable: isBillable,
        });
      }
      onCreated(project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anlegen fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div
        className="bg-[var(--surface)] rounded-xl border border-[var(--border)] w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Neues Projekt</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Lege ein Projekt an, das in der Zeiterfassung bebuchbar ist.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {availableQuotes.length > 0 && (
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">
                Aus Angebot übernehmen <span className="text-[var(--text-muted)] font-normal">(optional)</span>
              </label>
              <select
                value={selectedQuoteId}
                onChange={(e) => setSelectedQuoteId(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
              >
                <option value="">— Ohne Angebot —</option>
                {availableQuotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.quote_number}
                    {q.project_description ? ` — ${q.project_description}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Übernimmt Stunden-Budget und Aufgaben aus dem Angebot.
              </p>
            </div>
          )}

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Projektname</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
              autoFocus
              placeholder="z.B. Recruiting, On-Call, Sprint 23"
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-2">Verrechnung</label>
            <div className="flex bg-[var(--background)] border border-[var(--border)] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setIsBillable(true)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition ${isBillable ? "bg-[var(--brand-orange)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >Verrechenbar</button>
              <button
                type="button"
                onClick={() => setIsBillable(false)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition ${!isBillable ? "bg-[var(--surface-hover)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >Intern</button>
            </div>
          </div>
        </div>

        {error && (
          <div className="px-5 pb-2 -mt-2 text-[11px] text-rose-400">{error}</div>
        )}
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
          >Abbrechen</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--brand-orange)] text-white hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >{submitting ? "Wird erstellt…" : "Anlegen"}</button>
        </div>
      </div>
    </div>
  );
}
