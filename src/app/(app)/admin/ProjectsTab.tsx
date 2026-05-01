"use client";

// SCH-975 K2-H1 — Projekt-Verwaltung + Merge-Modal.
// Lists projects in the active company and lets a user with the
// `projekte_erstellen` permission merge two duplicates into one. The merge
// itself is the existing POST /api/projects/[id]/merge route; this UI just
// surfaces the picker, the confirmation, and the 409 quote-conflict step.

import { useCallback, useEffect, useMemo, useState } from "react";

import { useCompany } from "@/lib/company-context";
import { useI18n } from "@/lib/i18n-context";
import { updateProject } from "@/lib/db";
import type { TranslationKey } from "@/lib/translations/de";

type ProjectRow = {
  id: string;
  name: string;
  color: string | null;
  status: string | null;
  quote_id: string | null;
  created_at: string | null;
  task_count: number;
  time_entry_count: number;
};

type MergeResponse = {
  merged: boolean;
  source: { id: string; name: string };
  target: { id: string; name: string };
  tasks_moved: number;
  time_entries_moved: number;
  quote_id_copied: boolean;
};

type MergeError =
  | { code: "conflict"; details: { source_quote_id: string; target_quote_id: string } }
  | { code: string; error?: string };

type ConflictState = {
  sourceQuoteId: string;
  targetQuoteId: string;
};

export default function ProjectsTab() {
  const { company } = useCompany();
  const { t } = useI18n();
  const companyId = company.id;

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [keepWinner, setKeepWinner] = useState<"source" | "target" | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/projects?company_id=${encodeURIComponent(companyId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as
        | { projects?: ProjectRow[]; error?: string }
        | undefined;
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setProjects(data?.projects ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Reset selection when the list changes (e.g. after a merge).
  useEffect(() => {
    setSourceId((id) => (id && projects.some((p) => p.id === id) ? id : null));
    setTargetId((id) => (id && projects.some((p) => p.id === id) ? id : null));
  }, [projects]);

  const source = useMemo(
    () => projects.find((p) => p.id === sourceId) ?? null,
    [projects, sourceId],
  );
  const target = useMemo(
    () => projects.find((p) => p.id === targetId) ?? null,
    [projects, targetId],
  );
  const canMerge = !!source && !!target && source.id !== target.id;

  function toggleSelect(id: string) {
    if (sourceId === id) {
      setSourceId(null);
      return;
    }
    if (targetId === id) {
      setTargetId(null);
      return;
    }
    if (!sourceId) {
      setSourceId(id);
    } else if (!targetId) {
      setTargetId(id);
    }
    // both slots full → ignore further clicks; user must uncheck first.
  }

  function clearSelection() {
    setSourceId(null);
    setTargetId(null);
  }

  function openConfirm() {
    if (!canMerge) return;
    setMergeError(null);
    setConflict(null);
    setKeepWinner(null);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    setConfirmOpen(false);
    setMergeError(null);
    setConflict(null);
    setKeepWinner(null);
    setMerging(false);
  }

  async function performMerge() {
    if (!source || !target) return;
    setMerging(true);
    setMergeError(null);
    try {
      // If the user is in step 2 (conflict resolution) we first clear the
      // loser's quote_id so the merge route's same-quote / one-quote branch
      // takes over. RLS allows tenant members to update projects directly.
      if (conflict) {
        if (!keepWinner) {
          setMergeError(t("projects.merge.errorPickWinner"));
          setMerging(false);
          return;
        }
        const loserId = keepWinner === "source" ? target.id : source.id;
        await updateProject(loserId, { quote_id: null });
      }

      const res = await fetch(
        `/api/projects/${encodeURIComponent(source.id)}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_project_id: target.id,
            company_id: companyId,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as Partial<
        MergeResponse & MergeError
      >;

      if (res.status === 409 && data?.code === "conflict") {
        const det = (data as {
          details?: { source_quote_id?: string; target_quote_id?: string };
        }).details;
        if (det?.source_quote_id && det.target_quote_id) {
          setConflict({
            sourceQuoteId: det.source_quote_id,
            targetQuoteId: det.target_quote_id,
          });
          setKeepWinner(null);
          setMergeError(null);
          setMerging(false);
          return;
        }
      }

      if (!res.ok) {
        throw new Error(
          (data as { error?: string })?.error || `HTTP ${res.status}`,
        );
      }

      // Success → reload list and close.
      closeConfirm();
      await loadProjects();
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : String(err));
      setMerging(false);
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {t("projects.admin.title")}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {t("projects.admin.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearSelection}
            disabled={!sourceId && !targetId}
            className="px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition disabled:opacity-40"
          >
            {t("projects.admin.clearSelection")}
          </button>
          <button
            onClick={openConfirm}
            disabled={!canMerge}
            className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
          >
            {t("projects.admin.mergeBtn")}
          </button>
        </div>
      </div>

      <div className="text-xs text-[var(--text-muted)] mb-3">
        {t("projects.admin.selectionHint")}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">{t("common.loading")}</div>
      ) : loadError ? (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 text-sm text-rose-500">
          {loadError}
        </div>
      ) : (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)]">
            <thead className="bg-[var(--background)]">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">
                  {t("projects.admin.colSelect")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t("common.name")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t("projects.admin.colStatus")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t("projects.admin.colQuote")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {t("projects.admin.colTasks")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {t("projects.admin.colTime")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {projects.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {t("projects.admin.empty")}
                  </td>
                </tr>
              )}
              {projects.map((p) => {
                const role: "source" | "target" | null =
                  sourceId === p.id ? "source" : targetId === p.id ? "target" : null;
                const slotsFull = !!sourceId && !!targetId && role === null;
                return (
                  <tr
                    key={p.id}
                    className={`transition ${
                      role
                        ? "bg-[var(--accent)]/5"
                        : "hover:bg-[var(--surface-hover)]"
                    } ${slotsFull ? "opacity-60" : ""}`}
                  >
                    <td className="px-3 py-3">
                      <label
                        className={`inline-flex items-center gap-2 ${
                          slotsFull ? "cursor-not-allowed" : "cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={role !== null}
                          disabled={slotsFull}
                          onChange={() => toggleSelect(p.id)}
                          className="accent-[var(--accent)] w-4 h-4"
                        />
                        {role && (
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              role === "source"
                                ? "bg-rose-500/15 text-rose-500"
                                : "bg-emerald-500/15 text-emerald-500"
                            }`}
                          >
                            {role === "source"
                              ? t("projects.admin.sourceBadge")
                              : t("projects.admin.targetBadge")}
                          </span>
                        )}
                      </label>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        {p.color && (
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                        )}
                        <span className="font-medium text-[var(--text-primary)]">
                          {p.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                      {p.status || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.quote_id ? (
                        <span
                          className="font-mono text-[10px] text-[var(--text-muted)]"
                          title={p.quote_id}
                        >
                          {p.quote_id.slice(0, 8)}…
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[var(--text-secondary)]">
                      {p.task_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[var(--text-secondary)]">
                      {p.time_entry_count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================== MERGE CONFIRM MODAL ==================== */}
      {confirmOpen && source && target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={merging ? undefined : closeConfirm}
        >
          <div
            className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] max-w-2xl w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  {conflict
                    ? t("projects.merge.conflictTitle")
                    : t("projects.merge.title")}
                </h3>
                <p className="text-sm text-[var(--text-muted)]">
                  {conflict
                    ? t("projects.merge.conflictSubtitle")
                    : t("projects.merge.subtitle")}
                </p>
              </div>
              <button
                onClick={closeConfirm}
                disabled={merging}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
                title={t("common.close")}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {!conflict && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <ProjectCard
                    title={t("projects.admin.sourceBadge")}
                    project={source}
                    accent="rose"
                    t={t}
                  />
                  <ProjectCard
                    title={t("projects.admin.targetBadge")}
                    project={target}
                    accent="emerald"
                    t={t}
                  />
                </div>

                <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--text-secondary)] space-y-1">
                  <p>
                    {t("projects.merge.summaryLine", {
                      tasks: String(source.task_count),
                      time: String(source.time_entry_count),
                      target: target.name,
                    })}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    {t("projects.merge.deleteWarning", { source: source.name })}
                  </p>
                </div>
              </>
            )}

            {conflict && (
              <>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300 mb-4">
                  {t("projects.merge.conflictBody")}
                </div>

                <div className="space-y-2 mb-4">
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer ${
                      keepWinner === "source"
                        ? "border-[var(--accent)]/50 bg-[var(--accent)]/5"
                        : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="quote-winner"
                      checked={keepWinner === "source"}
                      onChange={() => setKeepWinner("source")}
                      className="accent-[var(--accent)] mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {t("projects.merge.keepSourceQuote", {
                          source: source.name,
                        })}
                      </div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                        {conflict.sourceQuoteId}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-1">
                        {t("projects.merge.keepSourceHint", {
                          target: target.name,
                        })}
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer ${
                      keepWinner === "target"
                        ? "border-[var(--accent)]/50 bg-[var(--accent)]/5"
                        : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="quote-winner"
                      checked={keepWinner === "target"}
                      onChange={() => setKeepWinner("target")}
                      className="accent-[var(--accent)] mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {t("projects.merge.keepTargetQuote", {
                          target: target.name,
                        })}
                      </div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                        {conflict.targetQuoteId}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-1">
                        {t("projects.merge.keepTargetHint", {
                          source: source.name,
                        })}
                      </div>
                    </div>
                  </label>
                </div>
              </>
            )}

            {mergeError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-500 mb-3">
                {mergeError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={closeConfirm}
                disabled={merging}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={performMerge}
                disabled={merging || (!!conflict && !keepWinner)}
                className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
              >
                {merging
                  ? t("projects.merge.merging")
                  : conflict
                    ? t("projects.merge.confirmAndMerge")
                    : t("projects.merge.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectCard({
  title,
  project,
  accent,
  t,
}: {
  title: string;
  project: ProjectRow;
  accent: "rose" | "emerald";
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const accentClass =
    accent === "rose"
      ? "border-rose-500/40 bg-rose-500/5"
      : "border-emerald-500/40 bg-emerald-500/5";
  const badgeClass =
    accent === "rose"
      ? "bg-rose-500/15 text-rose-500"
      : "bg-emerald-500/15 text-emerald-500";
  return (
    <div className={`rounded-lg border p-3 ${accentClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeClass}`}
        >
          {title}
        </span>
        {project.color && (
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: project.color }}
          />
        )}
      </div>
      <div className="font-medium text-sm text-[var(--text-primary)] truncate">
        {project.name}
      </div>
      <div className="text-[11px] text-[var(--text-muted)] mt-1 space-y-0.5">
        <div>
          {t("projects.admin.colTasks")}: {project.task_count}
        </div>
        <div>
          {t("projects.admin.colTime")}: {project.time_entry_count}
        </div>
        <div>
          {t("projects.admin.colQuote")}:{" "}
          {project.quote_id ? (
            <span className="font-mono">{project.quote_id.slice(0, 8)}…</span>
          ) : (
            "—"
          )}
        </div>
      </div>
    </div>
  );
}
