"use client";

import { useState, useEffect, useCallback } from "react";
import { UserProfile, USER_ROLE_OPTIONS, UserRole, WEEKDAY_LABELS_LONG } from "@/lib/types";
import {
  getUserProfiles, createUserProfile, updateUserProfile, deleteUserProfile,
  getUserWorkSchedules, replaceUserWorkSchedules,
} from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { COMPANIES } from "@/lib/company-context";

type ScheduleDraftRow = {
  weekday: number;
  start_time: string;
  end_time: string;
  daily_target_minutes: number;
  target_override: boolean; // user manually edited the pensum — stop auto-deriving
  enabled: boolean;
};

function minutesFromTimes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}

function emptyDraft(): ScheduleDraftRow[] {
  // Default: Mo–Fr 9–17:30 (7.5h = 450min), Sa/So off. Easy starting point; admin can edit.
  return Array.from({ length: 7 }, (_, i) => {
    const isWeekday = i < 5;
    return {
      weekday: i,
      start_time: isWeekday ? "09:00" : "",
      end_time: isWeekday ? "17:30" : "",
      daily_target_minutes: isWeekday ? 450 : 0,
      target_override: false,
      enabled: isWeekday,
    };
  });
}

function formatMinutesAsHours(mins: number): string {
  if (!mins) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("user");
  const [form, setForm] = useState({ email: "", password: "", display_name: "", role: "employee" as UserRole, company_access: ["vrthefans"] as string[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", role: "employee" as UserRole });
  const [scheduleUser, setScheduleUser] = useState<UserProfile | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraftRow[]>(emptyDraft());
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const profiles = await getUserProfiles();
      setUsers(profiles);
      const myProfile = profiles.find((p) => p.auth_user_id === user.id);
      setCurrentUserRole(myProfile?.role || "admin"); // first user is admin
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      // Create auth user via Supabase Admin API (server-side)
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Benutzer konnte nicht erstellt werden");

      // Create user profile
      await createUserProfile({
        auth_user_id: result.userId,
        display_name: form.display_name,
        email: form.email,
        role: form.role,
        job_title: "",
        iban: "",
        address: "",
        company_access: form.company_access,
      });

      setForm({ email: "", password: "", display_name: "", role: "employee", company_access: ["vrthefans"] });
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleCompany(userId: string, companyId: string) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const access = user.company_access.includes(companyId)
      ? user.company_access.filter((c) => c !== companyId)
      : [...user.company_access, companyId];
    await updateUserProfile(userId, { company_access: access });
    await loadData();
  }

  function startEditUser(u: UserProfile) {
    setEditingUser(u.id);
    setEditForm({ display_name: u.display_name, role: u.role });
  }

  async function saveEditUser(id: string) {
    await updateUserProfile(id, { display_name: editForm.display_name, role: editForm.role });
    setEditingUser(null);
    await loadData();
  }

  async function handleDelete(id: string) {
    if (confirm("Benutzer wirklich löschen?")) {
      await deleteUserProfile(id);
      await loadData();
    }
  }

  async function openSchedule(user: UserProfile) {
    setScheduleUser(user);
    setScheduleLoading(true);
    setScheduleSaved(false);
    try {
      const existing = await getUserWorkSchedules(user.id);
      const draft = emptyDraft();
      existing.forEach((row) => {
        const idx = row.weekday;
        if (idx < 0 || idx > 6) return;
        draft[idx] = {
          weekday: idx,
          start_time: row.start_time || "",
          end_time: row.end_time || "",
          daily_target_minutes: row.daily_target_minutes,
          // If target doesn't match Von–Bis, assume it was explicitly overridden.
          target_override: row.start_time && row.end_time
            ? minutesFromTimes(row.start_time, row.end_time) !== row.daily_target_minutes
            : row.daily_target_minutes > 0,
          enabled: row.daily_target_minutes > 0 || !!(row.start_time && row.end_time),
        };
      });
      setScheduleDraft(draft);
    } finally {
      setScheduleLoading(false);
    }
  }

  function updateDraftRow(weekday: number, patch: Partial<ScheduleDraftRow>) {
    setScheduleDraft((rows) =>
      rows.map((r) => {
        if (r.weekday !== weekday) return r;
        const next: ScheduleDraftRow = { ...r, ...patch };
        // Auto-derive pensum from Von–Bis unless the admin explicitly set it.
        if (("start_time" in patch || "end_time" in patch) && !next.target_override) {
          next.daily_target_minutes = minutesFromTimes(next.start_time, next.end_time);
        }
        if ("daily_target_minutes" in patch) {
          next.target_override = true;
        }
        return next;
      })
    );
  }

  function toggleDayEnabled(weekday: number) {
    setScheduleDraft((rows) =>
      rows.map((r) => {
        if (r.weekday !== weekday) return r;
        const enabled = !r.enabled;
        return {
          ...r,
          enabled,
          // Disabling clears pensum but keeps the times so re-enabling restores them.
          daily_target_minutes: enabled ? (r.daily_target_minutes || minutesFromTimes(r.start_time, r.end_time)) : 0,
          target_override: enabled ? r.target_override : false,
        };
      })
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

  const weekTotalMinutes = scheduleDraft
    .filter((r) => r.enabled)
    .reduce((s, r) => s + r.daily_target_minutes, 0);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;
  if (currentUserRole !== "admin") return <div className="text-center py-12 text-gray-500">Nur Administratoren haben Zugriff auf diese Seite.</div>;

  const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Benutzerverwaltung</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">
          + Neuer Benutzer
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateUser} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Neuen Benutzer erstellen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Anzeigename *</label>
              <input type="text" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">E-Mail *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Passwort *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Rolle</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className={inputClass}>
                {USER_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-400 mb-2">Firmenzugriff</label>
              <div className="flex flex-wrap gap-3">
                {COMPANIES.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input type="checkbox" checked={form.company_access.includes(c.id)}
                      onChange={(e) => {
                        const access = e.target.checked
                          ? [...form.company_access, c.id]
                          : form.company_access.filter((id) => id !== c.id);
                        setForm({ ...form, company_access: access });
                      }}
                      className="rounded accent-[var(--accent)]"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50">
              {saving ? "Erstelle..." : "Benutzer erstellen"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">
              Abbrechen
            </button>
          </div>
        </form>
      )}

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-Mail</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rolle</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Firmenzugriff</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Noch keine Benutzerprofile. Der erste Benutzer wird automatisch Admin.</td></tr>
            )}
            {users.map((u) => {
              const isEditing = editingUser === u.id;
              return (
              <tr key={u.id} className="hover:bg-[var(--surface-hover)] transition">
                <td className="px-4 py-3 text-sm">
                  {isEditing ? (
                    <input type="text" value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                      className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] w-full" />
                  ) : (
                    <span className="font-medium text-[var(--text-primary)]">{u.display_name}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{u.email}</td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                      className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)]">
                      {USER_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : u.role === "manager" ? "bg-emerald-500/15 text-emerald-400" : u.role === "accountant" ? "bg-orange-500/15 text-orange-400" : "bg-gray-500/15 text-gray-400"}`}>
                      {USER_ROLE_OPTIONS.find((o) => o.value === u.role)?.label || u.role}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {COMPANIES.map((c) => (
                      <button key={c.id} onClick={() => handleToggleCompany(u.id, c.id)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition ${
                          u.company_access.includes(c.id) ? "bg-emerald-500/15 text-emerald-400" : "bg-gray-500/15 text-gray-500 hover:bg-gray-500/25"
                        }`}>
                        {c.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {isEditing ? (
                    <>
                      <button onClick={() => saveEditUser(u.id)} className="text-sm text-emerald-400 hover:text-emerald-300 mr-2">Speichern</button>
                      <button onClick={() => setEditingUser(null)} className="text-sm text-gray-400 hover:text-gray-300">Abbrechen</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => openSchedule(u)} className="text-sm text-[var(--brand-orange)] hover:brightness-110 mr-2" title="Arbeitszeitmodell bearbeiten">Zeitmodell</button>
                      <button onClick={() => startEditUser(u)} className="text-sm text-[var(--accent)] hover:brightness-110 mr-2">Bearbeiten</button>
                      <button onClick={() => handleDelete(u.id)} className="text-sm text-rose-400 hover:text-rose-300">Löschen</button>
                    </>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {scheduleUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setScheduleUser(null)}>
          <div className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Arbeitszeitmodell</h3>
                <p className="text-sm text-[var(--text-muted)]">{scheduleUser.display_name} — {scheduleUser.email}</p>
              </div>
              <button onClick={() => setScheduleUser(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Schließen">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {scheduleLoading ? (
              <div className="py-10 text-center text-[var(--text-muted)] text-sm">Laden...</div>
            ) : (
              <>
                <div className="bg-[var(--background)] rounded-lg border border-[var(--border)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--surface-hover)] text-[10px] uppercase text-[var(--text-muted)]">
                        <th className="px-3 py-2 text-left font-medium">Tag</th>
                        <th className="px-3 py-2 text-left font-medium">Aktiv</th>
                        <th className="px-3 py-2 text-left font-medium">Von</th>
                        <th className="px-3 py-2 text-left font-medium">Bis</th>
                        <th className="px-3 py-2 text-right font-medium">Tagespensum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {scheduleDraft.map((row) => {
                        const derived = minutesFromTimes(row.start_time, row.end_time);
                        const mismatchHint = row.enabled && row.target_override && derived > 0 && derived !== row.daily_target_minutes;
                        return (
                          <tr key={row.weekday} className={row.enabled ? "" : "opacity-40"}>
                            <td className="px-3 py-2 font-medium text-[var(--text-primary)] w-28">{WEEKDAY_LABELS_LONG[row.weekday]}</td>
                            <td className="px-3 py-2 w-16">
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={() => toggleDayEnabled(row.weekday)}
                                className="accent-[var(--brand-orange)] w-4 h-4"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                value={row.start_time}
                                disabled={!row.enabled}
                                onChange={(e) => updateDraftRow(row.weekday, { start_time: e.target.value })}
                                className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] w-28 disabled:opacity-50"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                value={row.end_time}
                                disabled={!row.enabled}
                                onChange={(e) => updateDraftRow(row.weekday, { end_time: e.target.value })}
                                className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] w-28 disabled:opacity-50"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={row.daily_target_minutes}
                                  disabled={!row.enabled}
                                  onChange={(e) => updateDraftRow(row.weekday, { daily_target_minutes: Math.max(0, Number(e.target.value) || 0) })}
                                  className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] w-20 text-right disabled:opacity-50"
                                />
                                <span className="text-[10px] text-[var(--text-muted)] w-8">min</span>
                              </div>
                              {row.enabled && (
                                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                  {row.target_override ? (
                                    <button type="button" onClick={() => updateDraftRow(row.weekday, { target_override: false, daily_target_minutes: derived })}
                                      className="text-[var(--brand-orange)] hover:underline">
                                      {mismatchHint ? `Auf Zeitspanne (${formatMinutesAsHours(derived)}) zurücksetzen` : "Auto"}
                                    </button>
                                  ) : (
                                    <span>= {formatMinutesAsHours(row.daily_target_minutes)}</span>
                                  )}
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
                        <td className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">
                          {formatMinutesAsHours(weekTotalMinutes)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-[var(--text-muted)]">
                    Tagespensum wird aus Von–Bis abgeleitet und kann überschrieben werden.
                  </p>
                  <div className="flex items-center gap-3">
                    {scheduleSaved && <span className="text-xs text-emerald-400 font-medium">Gespeichert!</span>}
                    <button onClick={() => setScheduleUser(null)} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition">
                      Schließen
                    </button>
                    <button onClick={saveSchedule} disabled={scheduleSaving}
                      className="bg-[var(--brand-orange)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
                      {scheduleSaving ? "Speichert..." : "Speichern"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
