"use client";

// SCH-925 K2-ι Q3 — Urlaub/Abwesenheits-Übersicht.
//
// Top: 4 summary cards (Resturlaub, genommen, Saldo Stunden, Krankheit/sonstige).
// Bottom: list of this year's absences with add/edit/delete.
// Admin sees a per-employee picker; employees only see their own.

import { useEffect, useMemo, useState } from "react";
import {
  Absence,
  AbsenceKind,
  ABSENCE_KIND_OPTIONS,
  TimeEntry,
  UserLeaveBalance,
  UserProfile,
  UserWorkSchedule,
} from "@/lib/types";
import {
  createAbsence,
  deleteAbsence,
  getAbsences,
  getLeaveBalances,
  getUserWorkSchedules,
  updateAbsence,
} from "@/lib/db";
import { useI18n } from "@/lib/i18n-context";

interface Props {
  isAdmin: boolean;
  currentUserId: string;
  users: UserProfile[];
  ownEntries: TimeEntry[];
  ownSchedule: UserWorkSchedule[];
}

function formatHours(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  return h > 0 ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Count workdays between two ISO dates (inclusive) using a per-weekday
// has-target flag. Weekday encoding: 0 = Mon … 6 = Sun.
function workingDaysBetween(
  startISO: string,
  endISO: string,
  hasTargetByWeekday: Map<number, boolean>,
): number {
  if (!startISO || !endISO) return 0;
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const js = cursor.getDay();
    const wd = js === 0 ? 6 : js - 1;
    if (hasTargetByWeekday.get(wd)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function TimeAbsencesView({
  isAdmin,
  currentUserId,
  users,
  ownEntries,
  ownSchedule,
}: Props) {
  const { t } = useI18n();
  const currentYear = new Date().getFullYear();

  const [selectedUserId, setSelectedUserId] = useState<string>(currentUserId);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [balance, setBalance] = useState<UserLeaveBalance | null>(null);
  const [schedule, setSchedule] = useState<UserWorkSchedule[]>(ownSchedule);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    kind: "vacation" as AbsenceKind,
    starts_on: todayISO(),
    ends_on: todayISO(),
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // For employees the picker is fixed to their own ID.
  useEffect(() => {
    if (!isAdmin) setSelectedUserId(currentUserId);
  }, [isAdmin, currentUserId]);

  const loadData = useMemo(() => async () => {
    setLoading(true);
    try {
      const [abs, bal] = await Promise.all([
        getAbsences(selectedUserId),
        getLeaveBalances(currentYear),
      ]);
      setAbsences(abs);
      setBalance(bal.find((b) => b.user_id === selectedUserId) || null);
      // Schedule: only re-fetch when admin viewing someone else; otherwise
      // reuse the prop.
      if (selectedUserId !== currentUserId) {
        const sch = await getUserWorkSchedules(selectedUserId);
        setSchedule(sch);
      } else {
        setSchedule(ownSchedule);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, currentUserId, currentYear, ownSchedule]);

  useEffect(() => { loadData(); }, [loadData]);

  const hasTargetByWeekday = useMemo(() => {
    const map = new Map<number, boolean>();
    for (let i = 0; i < 7; i++) map.set(i, false);
    schedule.forEach((s) => map.set(s.weekday, s.daily_target_minutes > 0));
    return map;
  }, [schedule]);

  // Aggregations for the four summary cards.
  const yearStartISO = `${currentYear}-01-01`;
  const yearEndISO = `${currentYear}-12-31`;
  const yearAbsences = absences.filter((a) => a.starts_on <= yearEndISO && a.ends_on >= yearStartISO);

  const vacationDaysTaken = yearAbsences
    .filter((a) => a.kind === "vacation")
    .reduce((s, a) => s + Number(a.working_days || 0), 0);
  const compTimeDaysTaken = yearAbsences
    .filter((a) => a.kind === "comp_time")
    .reduce((s, a) => s + Number(a.working_days || 0), 0);
  const sickDaysTaken = yearAbsences
    .filter((a) => a.kind === "sick")
    .reduce((s, a) => s + Number(a.working_days || 0), 0);
  const otherDaysTaken = yearAbsences
    .filter((a) => a.kind === "other")
    .reduce((s, a) => s + Number(a.working_days || 0), 0);

  const vacationTotal = balance?.vacation_days_total ?? 25;
  const vacationCarried = balance?.vacation_days_carried ?? 0;
  const vacationRemaining = Math.max(0, vacationTotal + vacationCarried - vacationDaysTaken);
  const overtimeStart = balance?.overtime_starting_minutes ?? 0;

  // Hours saldo: sum work entries for selected user's time entries (admin-view
  // shows own entries because we don't pull other users' entries here; that's
  // a future enhancement). Subtract scheduled target up to today.
  // For simplicity (initial drop): show "starting saldo" + delta from work
  // entries vs target for the current year, then subtract comp-time absences.
  const hoursSaldo = useMemo(() => {
    if (selectedUserId !== currentUserId) {
      // Admin viewing someone else — just show the starting saldo. Live
      // computation requires querying others' entries which the existing
      // RLS allows but the page doesn't currently fetch.
      return overtimeStart - compTimeDaysTaken * 8 * 60;
    }
    // Saldo from the user's own entries — work minutes minus target up to
    // today, accumulated since the start of the year.
    const yearStart = new Date(`${currentYear}-01-01T00:00:00`);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let workMin = 0;
    let targetMin = 0;
    for (const e of ownEntries) {
      if (e.entry_type === "pause") continue;
      const d = new Date(e.start_time);
      if (d >= yearStart && d <= today) workMin += e.duration_minutes;
    }
    const cursor = new Date(yearStart);
    while (cursor <= today) {
      const js = cursor.getDay();
      const wd = js === 0 ? 6 : js - 1;
      const sch = schedule.find((s) => s.weekday === wd);
      targetMin += sch?.daily_target_minutes ?? 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    // Comp-time absences reduce the surplus (the user "spent" overtime).
    return overtimeStart + (workMin - targetMin) - compTimeDaysTaken * 8 * 60;
  }, [selectedUserId, currentUserId, ownEntries, schedule, overtimeStart, compTimeDaysTaken, currentYear]);

  function startCreate() {
    setEditingId(null);
    setForm({ kind: "vacation", starts_on: todayISO(), ends_on: todayISO(), note: "" });
    setShowForm(true);
    setError("");
  }

  function startEdit(a: Absence) {
    setEditingId(a.id);
    setForm({ kind: a.kind, starts_on: a.starts_on, ends_on: a.ends_on, note: a.note });
    setShowForm(true);
    setError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (form.ends_on < form.starts_on) {
        setError(t("time.absenceErrEndBeforeStart"));
        setSaving(false);
        return;
      }
      const days = workingDaysBetween(form.starts_on, form.ends_on, hasTargetByWeekday);
      if (editingId) {
        await updateAbsence(editingId, {
          kind: form.kind,
          starts_on: form.starts_on,
          ends_on: form.ends_on,
          working_days: days,
          note: form.note,
        });
      } else {
        await createAbsence({
          user_id: selectedUserId,
          kind: form.kind,
          starts_on: form.starts_on,
          ends_on: form.ends_on,
          working_days: days,
          note: form.note,
        });
      }
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("time.absenceConfirmDelete"))) return;
    await deleteAbsence(id);
    await loadData();
  }

  const inputClass =
    "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div className="mt-2 space-y-4">
      {/* Header — admin user picker */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("time.absencesTitle")}
        </h2>
        <div className="flex items-center gap-3">
          {isAdmin && users.length > 1 && (
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className={inputClass + " w-auto"}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name || u.email}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={startCreate}
            className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
          >
            {t("time.absenceAdd")}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">{t("time.cardRemainingVacation")}</p>
          <p className="text-2xl font-bold text-emerald-400">{vacationRemaining.toFixed(1)} {t("time.daysShort")}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {t("time.cardOfTotal", { total: (vacationTotal + vacationCarried).toFixed(1) })}
          </p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">{t("time.cardVacationTaken")}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{vacationDaysTaken.toFixed(1)} {t("time.daysShort")}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {t("time.cardCompTime")} {compTimeDaysTaken.toFixed(1)} {t("time.daysShort")}
          </p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">{t("time.cardHoursSaldo")}</p>
          <p className={`text-2xl font-bold ${hoursSaldo >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {hoursSaldo >= 0 ? "+" : ""}{formatHours(hoursSaldo)}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {t("time.cardStartingSaldo")} {overtimeStart >= 0 ? "+" : ""}{formatHours(overtimeStart)}
          </p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">{t("time.cardSickOther")}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {(sickDaysTaken + otherDaysTaken).toFixed(1)} {t("time.daysShort")}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {t("time.cardSick")} {sickDaysTaken.toFixed(1)} · {t("time.cardOther")} {otherDaysTaken.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Add/edit form */}
      {showForm && (
        <form
          onSubmit={handleSave}
          className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5"
        >
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
            {editingId ? t("time.absenceEditTitle") : t("time.absenceAddTitle")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.absenceKind")}</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as AbsenceKind })}
                className={inputClass}
              >
                {ABSENCE_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(o.labelKey as Parameters<typeof t>[0])}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.absenceFrom")}</label>
              <input
                type="date"
                value={form.starts_on}
                onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.absenceTo")}</label>
              <input
                type="date"
                value={form.ends_on}
                onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.absenceNote")}</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder={t("time.absenceNotePlaceholder")}
                className={inputClass}
              />
            </div>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-2">
            {t("time.absenceComputedDays", {
              days: String(workingDaysBetween(form.starts_on, form.ends_on, hasTargetByWeekday)),
            })}
          </p>
          {error && <p className="text-sm text-rose-400 mt-2">{error}</p>}
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-[var(--accent)] text-black px-5 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {/* Absences list */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("time.absenceKind")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("time.absenceFrom")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("time.absenceTo")}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">{t("time.absenceDays")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("time.absenceNote")}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">{t("common.loading")}</td></tr>
            )}
            {!loading && yearAbsences.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">{t("time.absenceEmpty")}</td></tr>
            )}
            {!loading && yearAbsences.map((a) => (
              <tr key={a.id} className="hover:bg-[var(--surface-hover)] transition">
                <td className="px-4 py-2.5 text-sm">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    a.kind === "vacation" ? "bg-emerald-500/15 text-emerald-400"
                    : a.kind === "comp_time" ? "bg-blue-500/15 text-blue-400"
                    : a.kind === "sick" ? "bg-amber-500/15 text-amber-400"
                    : "bg-gray-500/15 text-gray-400"
                  }`}>
                    {t(ABSENCE_KIND_OPTIONS.find((o) => o.value === a.kind)?.labelKey as Parameters<typeof t>[0])}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{a.starts_on}</td>
                <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{a.ends_on}</td>
                <td className="px-4 py-2.5 text-sm text-right font-medium text-[var(--text-primary)]">{a.working_days.toFixed(1)}</td>
                <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)] truncate max-w-[300px]">{a.note || "—"}</td>
                <td className="px-4 py-2.5 text-right space-x-2">
                  <button onClick={() => startEdit(a)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs">{t("common.edit")}</button>
                  <button onClick={() => handleDelete(a.id)} className="text-rose-400/70 hover:text-rose-400 text-xs">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
