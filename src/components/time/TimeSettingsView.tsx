"use client";

// SCH-925 K2-ι Q4 + Q5 — Zeiterfassung-Einstellungen.
//
// Admin-only sub-tab inside the time-tracking page. Lets a tenant admin:
//   - browse all users in the company
//   - edit each user's work-schedule (Arbeitszeitmodell) inline
//   - edit each user's leave-balance starting values for the current year
//     (Urlaubstage, übertragene Tage, Start-Überstundensaldo)
//   - create a new MA with starting values pre-filled — the same form
//     that lives on /admin, but enriched with leave-balance fields so
//     the new user already has Resturlaub + ±Stunden carried over on
//     day 1.
//
// All writes go through the same DB layer that `/admin` uses today, so
// RLS, validation and rollback paths are identical.

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  UserProfile,
  UserWorkSchedule,
  UserLeaveBalance,
  WEEKDAY_LABELS_LONG,
} from "@/lib/types";
import {
  getUserProfilesForMyCompanies,
  getUserWorkSchedules,
  replaceUserWorkSchedules,
  getLeaveBalances,
  upsertLeaveBalance,
} from "@/lib/db";
import { useI18n } from "@/lib/i18n-context";
import { useCompany } from "@/lib/company-context";

type ScheduleDraftRow = {
  weekday: number;
  start_time: string;
  end_time: string;
  daily_target_minutes: number;
  enabled: boolean;
};

type BalanceDraft = {
  vacation_days_total: number;
  vacation_days_carried: number;
  overtime_starting_minutes: number;
  note: string;
};

function emptyDraft(): ScheduleDraftRow[] {
  return Array.from({ length: 7 }, (_, i) => {
    const isWeekday = i < 5;
    return {
      weekday: i,
      start_time: isWeekday ? "09:00" : "",
      end_time: isWeekday ? "17:30" : "",
      daily_target_minutes: isWeekday ? 450 : 0,
      enabled: isWeekday,
    };
  });
}

function minutesFromTimes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}

function formatHM(mins: number): string {
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}m`;
}

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

export function TimeSettingsView({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const { accessibleCompanies } = useCompany();
  const currentYear = new Date().getFullYear();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [balances, setBalances] = useState<UserLeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);

  // Schedule editor modal state
  const [scheduleUser, setScheduleUser] = useState<UserProfile | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraftRow[]>(emptyDraft());
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // Balance editor modal state
  const [balanceUser, setBalanceUser] = useState<UserProfile | null>(null);
  const [balanceDraft, setBalanceDraft] = useState<BalanceDraft>({
    vacation_days_total: 25,
    vacation_days_carried: 0,
    overtime_starting_minutes: 0,
    note: "",
  });
  const [balanceSaving, setBalanceSaving] = useState(false);

  // New-user creation
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    display_name: "",
    company_access: [] as string[],
    vacation_days_total: 25,
    vacation_days_carried: 0,
    overtime_hours_starting: 0,
    overtime_minutes_starting: 0,
  });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [profiles, bal] = await Promise.all([
        getUserProfilesForMyCompanies(),
        getLeaveBalances(currentYear),
      ]);
      setUsers(profiles);
      setBalances(bal);
    } finally {
      setLoading(false);
    }
  }, [currentYear]);

  useEffect(() => { loadData(); }, [loadData]);

  // Initialize the create form's company_access once accessible companies load.
  useEffect(() => {
    if (accessibleCompanies.length > 0 && createForm.company_access.length === 0) {
      setCreateForm((f) => ({ ...f, company_access: [accessibleCompanies[0].id] }));
    }
  }, [accessibleCompanies, createForm.company_access.length]);

  const balanceByUser = useMemo(() => {
    const m = new Map<string, UserLeaveBalance>();
    balances.forEach((b) => m.set(b.user_id, b));
    return m;
  }, [balances]);

  // ---- Schedule editor ----

  async function openSchedule(u: UserProfile) {
    setScheduleUser(u);
    setScheduleSaved(false);
    const existing = await getUserWorkSchedules(u.id);
    const draft = emptyDraft();
    existing.forEach((row) => {
      const idx = row.weekday;
      if (idx < 0 || idx > 6) return;
      draft[idx] = {
        weekday: idx,
        start_time: row.start_time || "",
        end_time: row.end_time || "",
        daily_target_minutes: row.daily_target_minutes,
        enabled: row.daily_target_minutes > 0 || !!(row.start_time && row.end_time),
      };
    });
    setScheduleDraft(draft);
  }

  function updateScheduleRow(weekday: number, patch: Partial<ScheduleDraftRow>) {
    setScheduleDraft((rows) =>
      rows.map((r) => {
        if (r.weekday !== weekday) return r;
        const next = { ...r, ...patch };
        if (("start_time" in patch || "end_time" in patch) && next.enabled) {
          next.daily_target_minutes = minutesFromTimes(next.start_time, next.end_time);
        }
        return next;
      }),
    );
  }

  function toggleScheduleRow(weekday: number) {
    setScheduleDraft((rows) =>
      rows.map((r) => {
        if (r.weekday !== weekday) return r;
        const enabled = !r.enabled;
        return {
          ...r,
          enabled,
          daily_target_minutes: enabled
            ? r.daily_target_minutes || minutesFromTimes(r.start_time, r.end_time)
            : 0,
        };
      }),
    );
  }

  async function saveSchedule() {
    if (!scheduleUser) return;
    setScheduleSaving(true);
    try {
      const payload = scheduleDraft.map((row) => ({
        weekday: row.weekday,
        start_time: row.enabled ? (row.start_time || null) : null,
        end_time: row.enabled ? (row.end_time || null) : null,
        daily_target_minutes: row.enabled ? row.daily_target_minutes : 0,
      }));
      await replaceUserWorkSchedules(scheduleUser.id, payload);
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 1500);
    } finally {
      setScheduleSaving(false);
    }
  }

  // ---- Balance editor ----

  function openBalance(u: UserProfile) {
    const existing = balanceByUser.get(u.id);
    setBalanceUser(u);
    setBalanceDraft({
      vacation_days_total: existing?.vacation_days_total ?? 25,
      vacation_days_carried: existing?.vacation_days_carried ?? 0,
      overtime_starting_minutes: existing?.overtime_starting_minutes ?? 0,
      note: existing?.note ?? "",
    });
  }

  async function saveBalance() {
    if (!balanceUser) return;
    setBalanceSaving(true);
    try {
      await upsertLeaveBalance({
        user_id: balanceUser.id,
        year: currentYear,
        vacation_days_total: balanceDraft.vacation_days_total,
        vacation_days_carried: balanceDraft.vacation_days_carried,
        overtime_starting_minutes: balanceDraft.overtime_starting_minutes,
        note: balanceDraft.note,
      });
      setBalanceUser(null);
      await loadData();
    } finally {
      setBalanceSaving(false);
    }
  }

  // ---- Create new user ----

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreateSaving(true);
    try {
      // Step 1 — create auth user + profile + company members via existing API
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          display_name: createForm.display_name,
          role: "employee",
          company_access: createForm.company_access,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Benutzer konnte nicht erstellt werden");

      // Step 2 — find the new profile and seed its leave balance
      const profiles = await getUserProfilesForMyCompanies();
      const created = profiles.find((p) => p.email === createForm.email);
      if (created) {
        const startMinutes =
          createForm.overtime_hours_starting * 60 + createForm.overtime_minutes_starting;
        await upsertLeaveBalance({
          user_id: created.id,
          year: currentYear,
          vacation_days_total: createForm.vacation_days_total,
          vacation_days_carried: createForm.vacation_days_carried,
          overtime_starting_minutes: startMinutes,
          note: "",
        });
      }

      setShowCreate(false);
      setCreateForm({
        email: "",
        password: "",
        display_name: "",
        company_access: accessibleCompanies.length > 0 ? [accessibleCompanies[0].id] : [],
        vacation_days_total: 25,
        vacation_days_carried: 0,
        overtime_hours_starting: 0,
        overtime_minutes_starting: 0,
      });
      await loadData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreateSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)] text-sm">
        {t("time.settingsAdminOnly")}
      </div>
    );
  }

  const weekTotalMinutes = scheduleDraft
    .filter((r) => r.enabled)
    .reduce((s, r) => s + r.daily_target_minutes, 0);

  return (
    <div className="mt-2 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("time.settingsTitle")}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">{t("time.settingsHint")}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
        >
          {t("time.settingsNewUser")}
        </button>
      </div>

      {/* User table */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("common.name")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">{t("common.email")}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">{t("time.settingsVacationTotal")}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">{t("time.settingsCarried")}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase">{t("time.settingsStartSaldo")}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)] uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">{t("common.loading")}</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">{t("admin.noUsersYet")}</td></tr>
            )}
            {!loading && users.map((u) => {
              const bal = balanceByUser.get(u.id);
              return (
                <tr key={u.id} className="hover:bg-[var(--surface-hover)] transition">
                  <td className="px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]">{u.display_name || "—"}</td>
                  <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{u.email}</td>
                  <td className="px-4 py-2.5 text-sm text-right text-[var(--text-primary)]">
                    {bal ? bal.vacation_days_total.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right text-[var(--text-primary)]">
                    {bal ? bal.vacation_days_carried.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right text-[var(--text-primary)]">
                    {bal ? formatHM(bal.overtime_starting_minutes) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-2">
                    <button
                      onClick={() => openSchedule(u)}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      {t("time.settingsEditSchedule")}
                    </button>
                    <button
                      onClick={() => openBalance(u)}
                      className="text-xs text-[var(--brand-orange)] hover:underline"
                    >
                      {t("time.settingsEditBalance")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Schedule modal */}
      {scheduleUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setScheduleUser(null)}>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
              {t("time.settingsScheduleTitle", { name: scheduleUser.display_name || scheduleUser.email })}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="text-left py-2 pr-2 text-xs font-medium uppercase">{t("admin.scheduleDay")}</th>
                  <th className="text-center py-2 px-2 text-xs font-medium uppercase">{t("admin.scheduleActive")}</th>
                  <th className="text-left py-2 px-2 text-xs font-medium uppercase">{t("admin.scheduleFrom")}</th>
                  <th className="text-left py-2 px-2 text-xs font-medium uppercase">{t("admin.scheduleTo")}</th>
                  <th className="text-right py-2 pl-2 text-xs font-medium uppercase">{t("admin.scheduleDailyTarget")}</th>
                </tr>
              </thead>
              <tbody>
                {scheduleDraft.map((row) => (
                  <tr key={row.weekday} className={`border-t border-[var(--border)] ${row.enabled ? "" : "opacity-50"}`}>
                    <td className="py-2 pr-2 text-[var(--text-primary)]">{WEEKDAY_LABELS_LONG[row.weekday]}</td>
                    <td className="py-2 px-2 text-center">
                      <input type="checkbox" checked={row.enabled} onChange={() => toggleScheduleRow(row.weekday)} className="accent-[var(--accent)]" />
                    </td>
                    <td className="py-2 px-2">
                      <input type="time" value={row.start_time} onChange={(e) => updateScheduleRow(row.weekday, { start_time: e.target.value })} disabled={!row.enabled} className={inputClass + " text-xs py-1"} />
                    </td>
                    <td className="py-2 px-2">
                      <input type="time" value={row.end_time} onChange={(e) => updateScheduleRow(row.weekday, { end_time: e.target.value })} disabled={!row.enabled} className={inputClass + " text-xs py-1"} />
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={row.daily_target_minutes}
                        onChange={(e) => updateScheduleRow(row.weekday, { daily_target_minutes: Number(e.target.value) })}
                        disabled={!row.enabled}
                        className={inputClass + " text-xs py-1 text-right w-20 inline-block"}
                      />
                      <span className="ml-1 text-[10px] text-[var(--text-muted)]">{t("time.settingsMinutes")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right text-xs text-[var(--text-muted)] mt-2">
              {t("admin.scheduleWeeklyTotal")}: <span className="font-bold text-[var(--text-primary)]">{formatHM(weekTotalMinutes)}</span>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              {scheduleSaved && <span className="text-emerald-400 text-xs self-center">{t("common.saved")}</span>}
              <button onClick={() => setScheduleUser(null)} className="px-4 py-2 rounded-lg text-sm bg-[var(--surface-hover)] text-[var(--text-secondary)]">{t("common.cancel")}</button>
              <button onClick={saveSchedule} disabled={scheduleSaving} className="bg-[var(--accent)] text-black px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{scheduleSaving ? t("common.saving") : t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Balance modal */}
      {balanceUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setBalanceUser(null)}>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
              {t("time.settingsBalanceTitle", { name: balanceUser.display_name || balanceUser.email, year: String(currentYear) })}
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.settingsVacationTotalLabel")}</label>
                <input type="number" min={0} step="0.5" value={balanceDraft.vacation_days_total} onChange={(e) => setBalanceDraft({ ...balanceDraft, vacation_days_total: Number(e.target.value) })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.settingsCarriedLabel")}</label>
                <input type="number" step="0.5" value={balanceDraft.vacation_days_carried} onChange={(e) => setBalanceDraft({ ...balanceDraft, vacation_days_carried: Number(e.target.value) })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.settingsStartSaldoLabel")}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step={1}
                    value={Math.trunc(balanceDraft.overtime_starting_minutes / 60)}
                    onChange={(e) => {
                      const h = Number(e.target.value);
                      const m = Math.abs(balanceDraft.overtime_starting_minutes % 60);
                      const sign = h < 0 ? -1 : 1;
                      setBalanceDraft({ ...balanceDraft, overtime_starting_minutes: h * 60 + sign * m });
                    }}
                    className={inputClass + " w-24"}
                  />
                  <span className="text-xs text-[var(--text-muted)]">h</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={Math.abs(balanceDraft.overtime_starting_minutes % 60)}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      const h = Math.trunc(balanceDraft.overtime_starting_minutes / 60);
                      const sign = balanceDraft.overtime_starting_minutes < 0 || (h === 0 && balanceDraft.overtime_starting_minutes < 0) ? -1 : 1;
                      setBalanceDraft({ ...balanceDraft, overtime_starting_minutes: h * 60 + sign * m });
                    }}
                    className={inputClass + " w-20"}
                  />
                  <span className="text-xs text-[var(--text-muted)]">min</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-1">{t("time.settingsStartSaldoHint")}</p>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.absenceNote")}</label>
                <input type="text" value={balanceDraft.note} onChange={(e) => setBalanceDraft({ ...balanceDraft, note: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setBalanceUser(null)} className="px-4 py-2 rounded-lg text-sm bg-[var(--surface-hover)] text-[var(--text-secondary)]">{t("common.cancel")}</button>
              <button onClick={saveBalance} disabled={balanceSaving} className="bg-[var(--accent)] text-black px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{balanceSaving ? t("common.saving") : t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create-user modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setShowCreate(false)}>
          <form onSubmit={handleCreateUser} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">{t("time.settingsCreateTitle")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("admin.displayName")}</label>
                <input type="text" required value={createForm.display_name} onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("common.email")} *</label>
                <input type="email" required value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("admin.password")}</label>
                <input type="password" required minLength={6} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("admin.companyAccess")}</label>
                <div className="flex flex-wrap gap-3">
                  {accessibleCompanies.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={createForm.company_access.includes(c.id)}
                        onChange={(e) => setCreateForm({
                          ...createForm,
                          company_access: e.target.checked
                            ? [...createForm.company_access, c.id]
                            : createForm.company_access.filter((x) => x !== c.id),
                        })}
                        className="rounded accent-[var(--accent)]"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2 mt-2 pt-3 border-t border-[var(--border)]">
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">{t("time.settingsStartingValues")}</p>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.settingsVacationTotalLabel")}</label>
                <input type="number" min={0} step="0.5" value={createForm.vacation_days_total} onChange={(e) => setCreateForm({ ...createForm, vacation_days_total: Number(e.target.value) })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.settingsCarriedLabel")}</label>
                <input type="number" step="0.5" value={createForm.vacation_days_carried} onChange={(e) => setCreateForm({ ...createForm, vacation_days_carried: Number(e.target.value) })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">{t("time.settingsStartSaldoLabel")}</label>
                <div className="flex items-center gap-2">
                  <input type="number" step={1} value={createForm.overtime_hours_starting} onChange={(e) => setCreateForm({ ...createForm, overtime_hours_starting: Number(e.target.value) })} className={inputClass + " w-24"} />
                  <span className="text-xs text-[var(--text-muted)]">h</span>
                  <input type="number" min={0} max={59} value={createForm.overtime_minutes_starting} onChange={(e) => setCreateForm({ ...createForm, overtime_minutes_starting: Number(e.target.value) })} className={inputClass + " w-20"} />
                  <span className="text-xs text-[var(--text-muted)]">min</span>
                </div>
              </div>
            </div>
            {createError && <p className="text-sm text-rose-400 mt-3">{createError}</p>}
            <div className="flex gap-2 mt-4 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm bg-[var(--surface-hover)] text-[var(--text-secondary)]">{t("common.cancel")}</button>
              <button type="submit" disabled={createSaving} className="bg-[var(--accent)] text-black px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                {createSaving ? t("admin.creatingUser") : t("admin.createUserSubmit")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
