"use client";

// SCH-2087 — Arbeitszeitmodell-Vorlagen verwalten.
//
// Admin-only page. Lists every Modell der aktiven Company mit Wochenstunden +
// Anzahl zugewiesener MA, erlaubt Anlegen/Editieren/Löschen und das Zuweisen
// einzelner Mitarbeiter zu einem Modell. Schreibwege gehen über die selben
// db.ts-Helfer wie das User-Edit auf /admin, damit RLS + Validierung identisch
// greifen.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  assignWorkTimeModelToUser,
  deleteWorkTimeModel,
  getUserProfilesForMyCompanies,
  getWorkTimeModelDays,
  getWorkTimeModels,
} from "@/lib/db";
import type { UserProfile, WorkTimeModel } from "@/lib/types";
import { WEEKDAY_LABELS_LONG } from "@/lib/types";

type DayDraft = {
  weekday: number;
  start_time: string;
  end_time: string;
  daily_target_minutes: number;
  target_override: boolean;
  enabled: boolean;
};

type ModelDraft = {
  name: string;
  unpaid_break_minutes: number;
  vacation_days_per_year: number;
  days: DayDraft[];
};

function minutesFromTimes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}

function derivedTarget(start: string, end: string, breakMin: number): number {
  const window = minutesFromTimes(start, end);
  if (window <= 0) return 0;
  const paid = window - Math.max(0, breakMin);
  return paid > 0 ? paid : 0;
}

function formatMinutesAsHours(mins: number): string {
  if (!mins) return "0h";
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}m`;
}

function emptyDays(breakMin: number): DayDraft[] {
  return Array.from({ length: 7 }, (_, i) => {
    const isWeekday = i < 5;
    const start = isWeekday ? "09:00" : "";
    const end = isWeekday ? "17:30" : "";
    return {
      weekday: i,
      start_time: start,
      end_time: end,
      daily_target_minutes: isWeekday ? derivedTarget(start, end, breakMin) : 0,
      target_override: false,
      enabled: isWeekday,
    };
  });
}

// SCH-2087 — Standard-Pause = 30 min im "Neues Modell"-Formular vorbelegt.
const DEFAULT_BREAK_MINUTES = 30;
const DEFAULT_VACATION_DAYS = 25;

const INPUT_CLASS =
  "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

export default function ArbeitszeitmodelleAdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [models, setModels] = useState<WorkTimeModel[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState<ModelDraft>({
    name: "",
    unpaid_break_minutes: DEFAULT_BREAK_MINUTES,
    vacation_days_per_year: DEFAULT_VACATION_DAYS,
    days: emptyDays(DEFAULT_BREAK_MINUTES),
  });
  const [createSaving, setCreateSaving] = useState(false);

  const [editing, setEditing] = useState<WorkTimeModel | null>(null);
  const [editDraft, setEditDraft] = useState<ModelDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [assignedByModel, setAssignedByModel] = useState<Record<string, string[]>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      const profiles = await getUserProfilesForMyCompanies();
      const me = profiles.find((p) => p.auth_user_id === user.id);
      const admin = (me?.role || "") === "admin";
      setIsAdmin(admin);
      setUsers(profiles);
      const byModel: Record<string, string[]> = {};
      profiles.forEach((p) => {
        if (!p.work_time_model_id) return;
        if (!byModel[p.work_time_model_id]) byModel[p.work_time_model_id] = [];
        byModel[p.work_time_model_id].push(p.id);
      });
      setAssignedByModel(byModel);

      if (admin) {
        const ms = await getWorkTimeModels();
        setModels(ms);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ----- Create -----

  function resetCreateDraft() {
    setCreateDraft({
      name: "",
      unpaid_break_minutes: DEFAULT_BREAK_MINUTES,
      vacation_days_per_year: DEFAULT_VACATION_DAYS,
      days: emptyDays(DEFAULT_BREAK_MINUTES),
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateSaving(true);
    setError(null);
    try {
      const weeklyTotal = createDraft.days
        .filter((d) => d.enabled)
        .reduce((s, d) => s + d.daily_target_minutes, 0);
      const dayRows = createDraft.days.map((d) => ({
        weekday: d.weekday,
        start_time: d.enabled ? (d.start_time || null) : null,
        end_time: d.enabled ? (d.end_time || null) : null,
        daily_target_minutes: d.enabled ? d.daily_target_minutes : 0,
      }));

      // ORA-2295 (5th regression) — route through service-role API so RLS
      // denials or silent insert failures surface as user-visible errors
      // instead of looking like a successful save. Same anti-pattern as the
      // edit path fixed in commit 351d6c0.
      const companyId =
        typeof window !== "undefined"
          ? localStorage.getItem("activeCompanyId") || "vrthefans"
          : "vrthefans";
      const res = await fetch(`/api/admin/work-time-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          name: createDraft.name.trim() || "Neues Modell",
          weekly_target_minutes: weeklyTotal,
          unpaid_break_minutes: createDraft.unpaid_break_minutes,
          vacation_days_per_year: createDraft.vacation_days_per_year,
          days: dayRows,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          (data as { error?: string }).error ||
          `Anlegen fehlgeschlagen (${res.status})`;
        alert(`Fehler beim Anlegen: ${msg}`);
        throw new Error(msg);
      }

      resetCreateDraft();
      setShowCreate(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreateSaving(false);
    }
  }

  // ----- Edit -----

  async function openEdit(model: WorkTimeModel) {
    setError(null);
    setEditing(model);
    const days = await getWorkTimeModelDays(model.id);
    const draft = emptyDays(model.unpaid_break_minutes);
    days.forEach((d) => {
      const idx = d.weekday;
      if (idx < 0 || idx > 6) return;
      const start = d.start_time || "";
      const end = d.end_time || "";
      draft[idx] = {
        weekday: idx,
        start_time: start,
        end_time: end,
        daily_target_minutes: d.daily_target_minutes,
        target_override: start && end
          ? derivedTarget(start, end, model.unpaid_break_minutes) !== d.daily_target_minutes
          : d.daily_target_minutes > 0,
        enabled: d.daily_target_minutes > 0 || !!(start && end),
      };
    });
    setEditDraft({
      name: model.name,
      unpaid_break_minutes: model.unpaid_break_minutes,
      vacation_days_per_year: model.vacation_days_per_year,
      days: draft,
    });
  }

  async function handleEditSave() {
    if (!editing || !editDraft) return;
    setEditSaving(true);
    setError(null);
    try {
      const weeklyTotal = editDraft.days
        .filter((d) => d.enabled)
        .reduce((s, d) => s + d.daily_target_minutes, 0);
      const dayRows = editDraft.days.map((d) => ({
        weekday: d.weekday,
        start_time: d.enabled ? (d.start_time || null) : null,
        end_time: d.enabled ? (d.end_time || null) : null,
        daily_target_minutes: d.enabled ? d.daily_target_minutes : 0,
      }));

      // ORA-2295 — route through service-role API so RLS denials / silent
      // UPDATE errors surface as user-visible failures instead of looking like
      // a successful save.
      const url = `/api/admin/work-time-models/${editing.id}`;
      const settingsRes = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          name: editDraft.name.trim() || editing.name,
          weekly_target_minutes: weeklyTotal,
          unpaid_break_minutes: editDraft.unpaid_break_minutes,
          vacation_days_per_year: editDraft.vacation_days_per_year,
        }),
      });
      if (!settingsRes.ok) {
        const data = await settingsRes.json().catch(() => ({}));
        const msg = (data as { error?: string }).error || `Speichern fehlgeschlagen (${settingsRes.status})`;
        alert(`Fehler beim Speichern: ${msg}`);
        throw new Error(msg);
      }

      const daysRes = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replace_days", days: dayRows }),
      });
      if (!daysRes.ok) {
        const data = await daysRes.json().catch(() => ({}));
        const msg = (data as { error?: string }).error || `Tagespläne speichern fehlgeschlagen (${daysRes.status})`;
        alert(`Fehler beim Speichern der Tagespläne: ${msg}`);
        throw new Error(msg);
      }

      setEditing(null);
      setEditDraft(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(model: WorkTimeModel) {
    const assigned = assignedByModel[model.id]?.length ?? 0;
    const msg = assigned > 0
      ? `${model.name} ist ${assigned} Mitarbeiter${assigned === 1 ? "" : "n"} zugewiesen. Wirklich löschen? Die MA verlieren ihr Arbeitszeitmodell.`
      : `${model.name} wirklich löschen?`;
    if (!confirm(msg)) return;
    setError(null);
    try {
      await deleteWorkTimeModel(model.id);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleAssign(userId: string, modelId: string, on: boolean) {
    setError(null);
    try {
      await assignWorkTimeModelToUser(userId, on ? modelId : null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // ----- Render -----

  if (loading) {
    return <div className="flex justify-center py-12 text-[var(--text-muted)]">Lädt…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)] text-sm">
        Diese Seite ist nur für Admins.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Arbeitszeitmodelle</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Wiederverwendbare Vorlagen für Wochenpensum, Urlaubsanspruch und Pausenzeit. Einmal anlegen, mehreren Mitarbeitern zuweisen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
          >
            ← Zurück zur Admin-Übersicht
          </Link>
          <button
            onClick={() => { resetCreateDraft(); setShowCreate(true); }}
            className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
          >
            Neues Modell
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {showCreate && (
        <ModelForm
          title="Neues Arbeitszeitmodell"
          draft={createDraft}
          setDraft={setCreateDraft}
          saving={createSaving}
          onSubmit={handleCreate}
          onCancel={() => { setShowCreate(false); resetCreateDraft(); }}
        />
      )}

      <ModelList
        models={models}
        assignedByModel={assignedByModel}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      {editing && editDraft && (
        <EditModal
          editing={editing}
          draft={editDraft}
          setDraft={setEditDraft}
          users={users}
          assignedUserIds={assignedByModel[editing.id] ?? []}
          saving={editSaving}
          onSave={handleEditSave}
          onClose={() => { setEditing(null); setEditDraft(null); }}
          onToggleAssign={(userId, on) => toggleAssign(userId, editing.id, on)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function ModelList({
  models,
  assignedByModel,
  onEdit,
  onDelete,
}: {
  models: WorkTimeModel[];
  assignedByModel: Record<string, string[]>;
  onEdit: (m: WorkTimeModel) => void;
  onDelete: (m: WorkTimeModel) => void;
}) {
  if (models.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 text-center text-[var(--text-muted)] text-sm">
        Noch keine Modelle angelegt. Klick auf „Neues Modell“, um zu starten.
      </div>
    );
  }
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-x-auto">
      <table className="min-w-full divide-y divide-[var(--border)]">
        <thead className="bg-[var(--background)]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">Name</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">Wochenstunden</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">Pause/Tag</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">Urlaub/Jahr</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">Zugewiesen</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {models.map((m) => {
            const count = assignedByModel[m.id]?.length ?? 0;
            return (
              <tr key={m.id} className="hover:bg-[var(--surface-hover)] transition">
                <td className="px-4 py-3 text-sm font-medium text-[var(--text-primary)]">{m.name}</td>
                <td className="px-4 py-3 text-sm text-right text-[var(--text-secondary)]">{formatMinutesAsHours(m.weekly_target_minutes)}</td>
                <td className="px-4 py-3 text-sm text-right text-[var(--text-secondary)]">{m.unpaid_break_minutes} min</td>
                <td className="px-4 py-3 text-sm text-right text-[var(--text-secondary)]">{m.vacation_days_per_year}</td>
                <td className="px-4 py-3 text-sm text-right text-[var(--text-secondary)]">{count}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(m)} className="text-sm text-[var(--accent)] hover:brightness-110 mr-3">Bearbeiten</button>
                  <button onClick={() => onDelete(m)} className="text-sm text-rose-400 hover:text-rose-300">Löschen</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form (used by create + edit)
// ---------------------------------------------------------------------------

function ModelForm({
  title,
  draft,
  setDraft,
  saving,
  onSubmit,
  onCancel,
}: {
  title: string;
  draft: ModelDraft;
  setDraft: (next: ModelDraft) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  function patchDay(weekday: number, patch: Partial<DayDraft>) {
    setDraft({
      ...draft,
      days: draft.days.map((d) => {
        if (d.weekday !== weekday) return d;
        const next: DayDraft = { ...d, ...patch };
        if (("start_time" in patch || "end_time" in patch) && !next.target_override) {
          next.daily_target_minutes = derivedTarget(next.start_time, next.end_time, draft.unpaid_break_minutes);
        }
        if ("daily_target_minutes" in patch) next.target_override = true;
        return next;
      }),
    });
  }

  function toggleDay(weekday: number) {
    setDraft({
      ...draft,
      days: draft.days.map((d) => {
        if (d.weekday !== weekday) return d;
        const enabled = !d.enabled;
        return {
          ...d,
          enabled,
          daily_target_minutes: enabled
            ? (d.daily_target_minutes || derivedTarget(d.start_time, d.end_time, draft.unpaid_break_minutes))
            : 0,
          target_override: enabled ? d.target_override : false,
        };
      }),
    });
  }

  function setBreak(value: number) {
    const breakMin = Math.max(0, value);
    setDraft({
      ...draft,
      unpaid_break_minutes: breakMin,
      days: draft.days.map((d) =>
        d.target_override
          ? d
          : { ...d, daily_target_minutes: d.enabled ? derivedTarget(d.start_time, d.end_time, breakMin) : 0 },
      ),
    });
  }

  const weekTotal = draft.days.filter((d) => d.enabled).reduce((s, d) => s + d.daily_target_minutes, 0);

  return (
    <form onSubmit={onSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Name</label>
          <input
            required
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="z. B. 4-Tage-Woche Mo-Do"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Urlaubstage/Jahr</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={draft.vacation_days_per_year}
            onChange={(e) => setDraft({ ...draft, vacation_days_per_year: Math.max(0, Number(e.target.value) || 0) })}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Unbez. Pause/Tag (Minuten)</label>
          <input
            type="number"
            min={0}
            value={draft.unpaid_break_minutes}
            onChange={(e) => setBreak(Number(e.target.value) || 0)}
            className={INPUT_CLASS}
          />
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Standard 30 min. Wird vom Tagespensum abgezogen.</p>
        </div>
      </div>

      <div className="bg-[var(--background)] rounded-lg border border-[var(--border)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--surface-hover)] text-[10px] uppercase text-[var(--text-muted)]">
              <th className="px-3 py-2 text-left">Tag</th>
              <th className="px-3 py-2 text-left">Aktiv</th>
              <th className="px-3 py-2 text-left">Von</th>
              <th className="px-3 py-2 text-left">Bis</th>
              <th className="px-3 py-2 text-right">Tagespensum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {draft.days.map((d) => {
              const derived = derivedTarget(d.start_time, d.end_time, draft.unpaid_break_minutes);
              return (
                <tr key={d.weekday} className={d.enabled ? "" : "opacity-40"}>
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{WEEKDAY_LABELS_LONG[d.weekday]}</td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={() => toggleDay(d.weekday)}
                      className="accent-[var(--brand-orange)] w-4 h-4"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={d.start_time}
                      disabled={!d.enabled}
                      onChange={(e) => patchDay(d.weekday, { start_time: e.target.value })}
                      className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs w-28 disabled:opacity-50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={d.end_time}
                      disabled={!d.enabled}
                      onChange={(e) => patchDay(d.weekday, { end_time: e.target.value })}
                      className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs w-28 disabled:opacity-50"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={d.daily_target_minutes}
                        disabled={!d.enabled}
                        onChange={(e) => patchDay(d.weekday, { daily_target_minutes: Math.max(0, Number(e.target.value) || 0) })}
                        className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs w-20 text-right disabled:opacity-50"
                      />
                      <span className="text-[10px] text-[var(--text-muted)] w-8">min</span>
                    </div>
                    {d.enabled && d.target_override && derived > 0 && (
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        <button
                          type="button"
                          onClick={() => patchDay(d.weekday, { target_override: false, daily_target_minutes: derived })}
                          className="text-[var(--brand-orange)] hover:underline"
                        >
                          Auto ({formatMinutesAsHours(derived)})
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--surface-hover)] text-xs">
              <td className="px-3 py-2 font-semibold text-[var(--text-secondary)]" colSpan={4}>Wochenpensum</td>
              <td className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">{formatMinutesAsHours(weekTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-[var(--brand-orange)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition"
        >
          {saving ? "Speichert…" : "Speichern"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Edit modal (form + user assignment)
// ---------------------------------------------------------------------------

function EditModal({
  editing,
  draft,
  setDraft,
  users,
  assignedUserIds,
  saving,
  onSave,
  onClose,
  onToggleAssign,
}: {
  editing: WorkTimeModel;
  draft: ModelDraft;
  setDraft: (next: ModelDraft) => void;
  users: UserProfile[];
  assignedUserIds: string[];
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  onToggleAssign: (userId: string, on: boolean) => void;
}) {
  const [tab, setTab] = useState<"settings" | "users">("settings");
  const assignedSet = useMemo(() => new Set(assignedUserIds), [assignedUserIds]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-3xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{editing.name}</h3>
            <p className="text-xs text-[var(--text-muted)]">Arbeitszeitmodell bearbeiten</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-2xl leading-none" aria-label="Schließen">×</button>
        </div>
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-[var(--border)]">
          <button
            onClick={() => setTab("settings")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === "settings"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Modell
          </button>
          <button
            onClick={() => setTab("users")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === "users"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Zugewiesene Mitarbeiter ({assignedUserIds.length})
          </button>
        </div>
        <div className="p-6">
          {tab === "settings" && (
            <ModelForm
              title="Modell bearbeiten"
              draft={draft}
              setDraft={setDraft}
              saving={saving}
              onSubmit={(e) => { e.preventDefault(); onSave(); }}
              onCancel={onClose}
            />
          )}
          {tab === "users" && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {users.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-6">Keine Mitarbeiter im Unternehmen.</p>
              ) : (
                users.map((u) => {
                  const on = assignedSet.has(u.id);
                  const otherModelId = u.work_time_model_id;
                  const hasOtherModel = !!otherModelId && otherModelId !== editing.id;
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition cursor-pointer ${
                        on ? "border-[var(--accent)]/40 bg-[var(--accent)]/5" : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => onToggleAssign(u.id, e.target.checked)}
                        className="accent-[var(--accent)] w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">{u.display_name}</div>
                        <div className="text-xs text-[var(--text-muted)] truncate">{u.email}</div>
                      </div>
                      {!on && hasOtherModel && (
                        <span className="text-[10px] text-amber-400">anderes Modell aktiv</span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
