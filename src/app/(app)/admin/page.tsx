"use client";

import { useState, useEffect, useCallback } from "react";
import { UserProfile, USER_ROLE_OPTIONS, UserRole, CompanyRole, UserRoleAssignment } from "@/lib/types";
import {
  DEFAULT_MEMBER_PERMISSIONS,
  MEMBER_PERMISSION_KEYS,
  type MemberPermissionKey,
  type MemberPermissions,
} from "@/lib/permissions";
import {
  getUserProfilesForMyCompanies, updateUserProfile,
  getUserWorkSchedules, replaceUserWorkSchedules,
  getCompanyRoles, createCompanyRole, updateCompanyRole, deleteCompanyRole,
  getUserRoleAssignments, assignRoleToUser, removeRoleFromUser,
} from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/lib/company-context";
import { useI18n } from "@/lib/i18n-context";
import { SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n-context";
import type { TranslationKey } from "@/lib/translations/de";

type ScheduleDraftRow = {
  weekday: number;
  start_time: string;
  end_time: string;
  daily_target_minutes: number;
  target_override: boolean; // user manually edited the pensum — stop auto-deriving
  enabled: boolean;
  unpaid_break_minutes: number; // SCH-918 K2-G10
};

// SCH-918 K2-G2 — labels for the 9 granular permission keys; rendered as
// checkboxes in the create-user form.
const PERMISSION_LABELS: Record<MemberPermissionKey, string> = {
  angebote: "Angebote",
  rechnungen: "Rechnungen",
  kunden: "Kunden",
  produkte: "Produkte",
  fixkosten: "Fixkosten",
  belege: "Belege",
  konto: "Konto",
  export: "Export",
  projekte_erstellen: "Projekte erstellen",
};

import UserDiagnoseTab from "./UserDiagnoseTab";

type AdminTab = "users" | "roles" | "diagnose";

function minutesFromTimes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}

// SCH-918 K2-G10 — paid daily target = (Bis − Von) − unpaid break.
// Replaces the old "static 1h subtraction" baked into emptyDraft (450min for
// 9–17:30). With this helper the admin's break value drives the derived
// target dynamically, and the UI re-computes whenever start/end/break change.
function derivedTarget(start: string, end: string, unpaidBreakMinutes: number): number {
  const window = minutesFromTimes(start, end);
  if (window <= 0) return 0;
  const paid = window - Math.max(0, unpaidBreakMinutes);
  return paid > 0 ? paid : 0;
}

function emptyDraft(): ScheduleDraftRow[] {
  // SCH-918 K2-G10 — Mo–Fr default 9:00–17:30 with 60min unpaid break →
  // derived daily_target = 450min. Saturday/Sunday off. Admin can edit
  // window or break; daily_target stays in sync via derivedTarget unless
  // the admin manually overrides it.
  return Array.from({ length: 7 }, (_, i) => {
    const isWeekday = i < 5;
    const start = isWeekday ? "09:00" : "";
    const end = isWeekday ? "17:30" : "";
    const breakMin = isWeekday ? 60 : 0;
    return {
      weekday: i,
      start_time: start,
      end_time: end,
      daily_target_minutes: derivedTarget(start, end, breakMin),
      target_override: false,
      enabled: isWeekday,
      unpaid_break_minutes: breakMin,
    };
  });
}

function formatMinutesAsHours(mins: number): string {
  if (!mins) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const DEFAULT_ROLE_COLORS = [
  "#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444",
  "#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#84cc16",
];

export default function AdminPage() {
  const { accessibleCompanies: COMPANIES } = useCompany();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("user");
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    display_name: "",
    role: "employee" as UserRole,
    company_access: ["vrthefans"] as string[],
    default_language: "de" as AppLocale,
    // SCH-918 K2-G5
    anchor_company_id: "" as string,
    // SCH-918 K2-G2
    permissions: { ...DEFAULT_MEMBER_PERMISSIONS } as MemberPermissions,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", role: "employee" as UserRole });
  const [scheduleUser, setScheduleUser] = useState<UserProfile | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraftRow[]>(emptyDraft());
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // Roles state
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: "", description: "", color: DEFAULT_ROLE_COLORS[0] });
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editRoleForm, setEditRoleForm] = useState({ name: "", description: "", color: "" });

  // User-role assignments state
  const [userRoleMap, setUserRoleMap] = useState<Record<string, string[]>>({}); // userId → roleId[]
  const [roleAssignUser, setRoleAssignUser] = useState<UserProfile | null>(null);
  const [assignSaving, setAssignSaving] = useState(false);

  // Password-reset state (SCH-557)
  const [resetUser, setResetUser] = useState<UserProfile | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetResult, setResetResult] = useState<
    | { kind: "password"; tempPassword: string; email: string; displayName: string; note?: string }
    | { kind: "sent"; email: string }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [tempPwCopied, setTempPwCopied] = useState(false);

  async function copyTempPassword(pw: string) {
    try {
      await navigator.clipboard.writeText(pw);
      setTempPwCopied(true);
      setTimeout(() => setTempPwCopied(false), 1500);
    } catch {
      // Clipboard blocked — user can still read/select the password manually.
    }
  }

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const profiles = await getUserProfilesForMyCompanies();
      setUsers(profiles);
      const myProfile = profiles.find((p) => p.auth_user_id === user.id);
      setCurrentUserRole(myProfile?.role || "admin"); // first user is admin
      setCurrentAuthUserId(user.id);
    }
    setLoading(false);
  }, []);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const r = await getCompanyRoles();
      setRoles(r);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const loadUserRoles = useCallback(async (userList: UserProfile[]) => {
    const map: Record<string, string[]> = {};
    await Promise.all(
      userList.map(async (u) => {
        const assignments = await getUserRoleAssignments(u.id);
        map[u.id] = assignments.map((a) => a.role_id);
      })
    );
    setUserRoleMap(map);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (activeTab === "roles" || activeTab === "users") {
      loadRoles();
    }
  }, [activeTab, loadRoles]);
  useEffect(() => {
    if (users.length > 0 && roles.length > 0) {
      loadUserRoles(users);
    }
  }, [users, roles, loadUserRoles]);

  // --- User management handlers (unchanged) ---

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          display_name: form.display_name,
          role: form.role,
          company_access: form.company_access,
          // SCH-918 K2-γ
          anchor_company_id: form.anchor_company_id || null,
          permissions: form.permissions,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Benutzer konnte nicht erstellt werden");

      setForm({
        email: "",
        password: "",
        display_name: "",
        role: "employee",
        company_access: ["vrthefans"],
        default_language: "de",
        anchor_company_id: "",
        permissions: { ...DEFAULT_MEMBER_PERMISSIONS },
      });
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

  async function handleDelete(authUserId: string) {
    if (!confirm(t("admin.confirmDeleteUser"))) return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_user_id: authUserId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body?.error || "Löschen fehlgeschlagen.");
      return;
    }
    await loadData();
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
        const start = row.start_time || "";
        const end = row.end_time || "";
        const breakMin = row.unpaid_break_minutes ?? 0;
        // SCH-918 K2-G10 — override flag is "stored target diverges from
        // derivedTarget", so the auto-link button only appears when the admin
        // actually customised the number.
        const targetOverride = start && end
          ? derivedTarget(start, end, breakMin) !== row.daily_target_minutes
          : row.daily_target_minutes > 0;
        draft[idx] = {
          weekday: idx,
          start_time: start,
          end_time: end,
          daily_target_minutes: row.daily_target_minutes,
          target_override: targetOverride,
          enabled: row.daily_target_minutes > 0 || !!(start && end),
          unpaid_break_minutes: breakMin,
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
        // SCH-918 K2-G10 — auto-derive target from window AND break unless
        // the admin has explicitly overridden the number. Editing any of
        // start/end/break re-derives so the "minus break" stays honest.
        const inputAffectsDerivation =
          "start_time" in patch || "end_time" in patch || "unpaid_break_minutes" in patch;
        if (inputAffectsDerivation && !next.target_override) {
          next.daily_target_minutes = derivedTarget(
            next.start_time,
            next.end_time,
            next.unpaid_break_minutes,
          );
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
          daily_target_minutes: enabled
            ? (r.daily_target_minutes || derivedTarget(r.start_time, r.end_time, r.unpaid_break_minutes))
            : 0,
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
        unpaid_break_minutes: row.enabled ? row.unpaid_break_minutes : 0,
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

  // --- Role CRUD handlers ---

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setRoleError("");
    setRoleSaving(true);
    try {
      await createCompanyRole({
        name: roleForm.name,
        description: roleForm.description || null,
        color: roleForm.color || null,
      });
      setRoleForm({ name: "", description: "", color: DEFAULT_ROLE_COLORS[roles.length % DEFAULT_ROLE_COLORS.length] });
      setShowRoleForm(false);
      await loadRoles();
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : String(err));
    } finally {
      setRoleSaving(false);
    }
  }

  function startEditRole(role: CompanyRole) {
    setEditingRole(role.id);
    setEditRoleForm({ name: role.name, description: role.description || "", color: role.color || "#6b7280" });
  }

  async function saveEditRole(id: string) {
    setRoleError("");
    try {
      await updateCompanyRole(id, {
        name: editRoleForm.name,
        description: editRoleForm.description || null,
        color: editRoleForm.color || null,
      });
      setEditingRole(null);
      await loadRoles();
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteRole(id: string) {
    if (confirm(t("admin.confirmDeleteRole"))) {
      await deleteCompanyRole(id);
      await loadRoles();
      await loadUserRoles(users);
    }
  }

  // --- User-role assignment handlers ---

  async function openRoleAssign(user: UserProfile) {
    setRoleAssignUser(user);
  }

  // --- Password reset handlers (SCH-557) ---

  async function handleResetPassword(user: UserProfile, mode: "email" | "show") {
    setResetBusy(true);
    setResetResult(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_user_id: user.auth_user_id,
          action: mode === "email" ? "send_temp_password_email" : "set_temp_password",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetResult({ kind: "error", message: data.error || "Fehler beim Zurücksetzen" });
        return;
      }
      if (data.sent) {
        setResetResult({ kind: "sent", email: data.email });
        return;
      }
      if (data.temp_password) {
        const note =
          data.reason === "not_configured"
            ? "E-Mail-Versand nicht konfiguriert — Passwort manuell weitergeben."
            : data.reason === "error"
              ? `E-Mail konnte nicht gesendet werden: ${data.message || "unbekannter Fehler"}. Passwort manuell weitergeben.`
              : undefined;
        setResetResult({
          kind: "password",
          tempPassword: data.temp_password,
          email: user.email,
          displayName: user.display_name,
          note,
        });
      }
    } catch (err) {
      setResetResult({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setResetBusy(false);
    }
  }

  function closeResetModal() {
    setResetUser(null);
    setResetResult(null);
    setResetBusy(false);
    setTempPwCopied(false);
  }

  async function toggleUserRole(userId: string, roleId: string) {
    setAssignSaving(true);
    try {
      const current = userRoleMap[userId] || [];
      if (current.includes(roleId)) {
        await removeRoleFromUser(userId, roleId);
      } else {
        await assignRoleToUser(userId, roleId);
      }
      // Refresh this user's assignments
      const assignments = await getUserRoleAssignments(userId);
      setUserRoleMap((prev) => ({ ...prev, [userId]: assignments.map((a) => a.role_id) }));
    } finally {
      setAssignSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;
  if (currentUserRole !== "admin") return <div className="text-center py-12 text-gray-500">{t("admin.adminOnly")}</div>;

  const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-[var(--border)]">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
            activeTab === "users"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {t("admin.tabUsers")}
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
            activeTab === "roles"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {t("admin.tabRoles")}
        </button>
        <button
          onClick={() => setActiveTab("diagnose")}
          className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
            activeTab === "diagnose"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          User-Diagnose
        </button>
      </div>

      {activeTab === "diagnose" && <UserDiagnoseTab />}

      {/* ==================== USERS TAB ==================== */}
      {activeTab === "users" && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("admin.userManagement")}</h1>
            <button onClick={() => setShowForm(!showForm)} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">
              {t("admin.newUser")}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreateUser} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("admin.createUser")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t("admin.displayName")}</label>
                  <input type="text" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t("common.email")} *</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t("admin.password")}</label>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t("admin.systemRole")}</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className={inputClass}>
                    {USER_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t("admin.defaultLanguage")}</label>
                  <select value={form.default_language} onChange={(e) => setForm({ ...form, default_language: e.target.value as AppLocale })} className={inputClass}>
                    {SUPPORTED_LOCALES.map((loc) => (
                      <option key={loc.code} value={loc.code}>{loc.flag} {loc.label}</option>
                    ))}
                  </select>
                </div>
                {/* G6 — multi-company-access checkboxes (already existed, kept) */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-400 mb-2">{t("admin.companyAccess")}</label>
                  <div className="flex flex-wrap gap-3">
                    {COMPANIES.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={form.company_access.includes(c.id)}
                          onChange={(e) => {
                            const access = e.target.checked
                              ? [...form.company_access, c.id]
                              : form.company_access.filter((id) => id !== c.id);
                            // If the anchor was on a company we just removed, clear it.
                            const nextAnchor = access.includes(form.anchor_company_id) ? form.anchor_company_id : "";
                            setForm({ ...form, company_access: access, anchor_company_id: nextAnchor });
                          }}
                          className="rounded accent-[var(--accent)]"
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>

                {/* SCH-918 K2-G5 — anchor company (single-select) */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Arbeitgeber-Unternehmen (Anker)
                  </label>
                  <select
                    value={form.anchor_company_id}
                    onChange={(e) => setForm({ ...form, anchor_company_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">— bitte wählen —</option>
                    {COMPANIES.filter((c) => form.company_access.includes(c.id)).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    In welchem Unternehmen der MA angestellt ist. Auswahl ist auf die oben gewählten Unternehmen beschränkt.
                  </p>
                </div>

                {/* SCH-918 K2-G2 — granulare Permissions (greyed out for admin/manager/accountant; they get FULL automatically) */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Berechtigungen (Mitarbeiter)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {MEMBER_PERMISSION_KEYS.map((key) => {
                      const isEmployee = form.role === "employee";
                      const checked = isEmployee ? form.permissions[key] : true;
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-2 text-sm ${
                            isEmployee
                              ? "text-[var(--text-secondary)]"
                              : "text-[var(--text-muted)] opacity-60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!isEmployee}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                permissions: { ...form.permissions, [key]: e.target.checked },
                              })
                            }
                            className="rounded accent-[var(--accent)]"
                          />
                          {PERMISSION_LABELS[key]}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-2">
                    Dashboard, Spesen und Zeiterfassung sind immer aktiv. Admin/Geschäftsführer/Buchhalter erhalten automatisch alle Rechte.
                  </p>
                </div>
              </div>
              {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
              <div className="flex gap-3 mt-4">
                <button type="submit" disabled={saving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50">
                  {saving ? t("admin.creatingUser") : t("admin.createUserSubmit")}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          )}

          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)]">
              <thead className="bg-[var(--background)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.name")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.email")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("admin.systemRole")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("admin.companyRoles")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("admin.companyAccess")}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{t("admin.noUsersYet")}</td></tr>
                )}
                {users.map((u) => {
                  const isEditing = editingUser === u.id;
                  const userRoles = (userRoleMap[u.id] || []).map((rid) => roles.find((r) => r.id === rid)).filter(Boolean) as CompanyRole[];
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
                      <div className="flex flex-wrap gap-1 items-center">
                        {userRoles.length > 0 ? userRoles.map((role) => (
                          <span
                            key={role.id}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${role.color || "#6b7280"}20`,
                              color: role.color || "#6b7280",
                            }}
                          >
                            {role.name}
                          </span>
                        )) : (
                          <span className="text-[10px] text-gray-500">—</span>
                        )}
                        <button
                          onClick={() => openRoleAssign(u)}
                          className="text-[10px] text-[var(--accent)] hover:brightness-110 ml-1"
                          title={t("admin.assignRoles")}
                        >
                          +
                        </button>
                      </div>
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
                          <button onClick={() => saveEditUser(u.id)} className="text-sm text-emerald-400 hover:text-emerald-300 mr-2">{t("common.save")}</button>
                          <button onClick={() => setEditingUser(null)} className="text-sm text-gray-400 hover:text-gray-300">{t("common.cancel")}</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openSchedule(u)} className="text-sm text-[var(--brand-orange)] hover:brightness-110 mr-2" title={t("admin.scheduleTitle")}>{t("admin.schedule")}</button>
                          {u.auth_user_id !== currentAuthUserId && (
                            <button
                              onClick={() => { setResetUser(u); setResetResult(null); }}
                              className="text-sm text-amber-500 hover:brightness-110 mr-2"
                              title="Passwort zurücksetzen"
                            >
                              Passwort
                            </button>
                          )}
                          <button onClick={() => startEditUser(u)} className="text-sm text-[var(--accent)] hover:brightness-110 mr-2">{t("common.edit")}</button>
                          <button onClick={() => handleDelete(u.auth_user_id)} className="text-sm text-rose-400 hover:text-rose-300">{t("common.delete")}</button>
                        </>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ==================== ROLES TAB ==================== */}
      {activeTab === "roles" && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("admin.roleManagement")}</h1>
            <button onClick={() => { setShowRoleForm(!showRoleForm); setRoleError(""); }} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">
              {t("admin.newRole")}
            </button>
          </div>

          {showRoleForm && (
            <form onSubmit={handleCreateRole} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("admin.createRole")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t("admin.roleName")}</label>
                  <input type="text" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} required className={inputClass} placeholder={t("admin.roleNamePlaceholder")} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t("admin.roleDescription")}</label>
                  <input type="text" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} className={inputClass} placeholder={t("admin.roleDescriptionPlaceholder")} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t("admin.roleColor")}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={roleForm.color} onChange={(e) => setRoleForm({ ...roleForm, color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-[var(--border)] cursor-pointer bg-transparent p-0.5" />
                    <div className="flex gap-1 flex-wrap">
                      {DEFAULT_ROLE_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setRoleForm({ ...roleForm, color: c })}
                          className={`w-6 h-6 rounded-full border-2 transition ${roleForm.color === c ? "border-white scale-110" : "border-transparent hover:border-white/50"}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {roleError && <p className="text-sm text-rose-400 mt-3">{roleError}</p>}
              <div className="flex gap-3 mt-4">
                <button type="submit" disabled={roleSaving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50">
                  {roleSaving ? t("admin.creatingRole") : t("admin.createRoleSubmit")}
                </button>
                <button type="button" onClick={() => setShowRoleForm(false)} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          )}

          {rolesLoading ? (
            <div className="text-center py-8 text-gray-500">{t("common.loading")}</div>
          ) : (
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)]">
                <thead className="bg-[var(--background)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("admin.roleColor")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.name")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.description")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("admin.assignedUsers")}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {roles.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">{t("admin.noRolesYet")}</td></tr>
                  )}
                  {roles.map((role) => {
                    const isEditing = editingRole === role.id;
                    const assignedUsers = users.filter((u) => (userRoleMap[u.id] || []).includes(role.id));
                    return (
                      <tr key={role.id} className="hover:bg-[var(--surface-hover)] transition">
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <input type="color" value={editRoleForm.color} onChange={(e) => setEditRoleForm({ ...editRoleForm, color: e.target.value })}
                              className="w-8 h-8 rounded border border-[var(--border)] cursor-pointer bg-transparent p-0.5" />
                          ) : (
                            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: role.color || "#6b7280" }} />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {isEditing ? (
                            <input type="text" value={editRoleForm.name} onChange={(e) => setEditRoleForm({ ...editRoleForm, name: e.target.value })}
                              className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] w-full" />
                          ) : (
                            <span
                              className="font-medium text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: `${role.color || "#6b7280"}20`,
                                color: role.color || "#6b7280",
                              }}
                            >
                              {role.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                          {isEditing ? (
                            <input type="text" value={editRoleForm.description} onChange={(e) => setEditRoleForm({ ...editRoleForm, description: e.target.value })}
                              className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] w-full" />
                          ) : (
                            role.description || <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {assignedUsers.length > 0 ? assignedUsers.map((u) => (
                              <span key={u.id} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--surface-hover)] text-[var(--text-secondary)]">
                                {u.display_name}
                              </span>
                            )) : (
                              <span className="text-[10px] text-gray-500">{t("common.none")}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isEditing ? (
                            <>
                              <button onClick={() => saveEditRole(role.id)} className="text-sm text-emerald-400 hover:text-emerald-300 mr-2">{t("common.save")}</button>
                              <button onClick={() => setEditingRole(null)} className="text-sm text-gray-400 hover:text-gray-300">{t("common.cancel")}</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEditRole(role)} className="text-sm text-[var(--accent)] hover:brightness-110 mr-2">{t("common.edit")}</button>
                              <button onClick={() => handleDeleteRole(role.id)} className="text-sm text-rose-400 hover:text-rose-300">{t("common.delete")}</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {roleError && !showRoleForm && <p className="text-sm text-rose-400 mt-3">{roleError}</p>}
        </>
      )}

      {/* ==================== ROLE ASSIGNMENT MODAL ==================== */}
      {roleAssignUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setRoleAssignUser(null)}>
          <div className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t("admin.assignRoles")}</h3>
                <p className="text-sm text-[var(--text-muted)]">{roleAssignUser.display_name}</p>
              </div>
              <button onClick={() => setRoleAssignUser(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" title={t("common.close")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {roles.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">{t("admin.noRolesHint")}</p>
            ) : (
              <div className="space-y-2">
                {roles.map((role) => {
                  const isAssigned = (userRoleMap[roleAssignUser.id] || []).includes(role.id);
                  return (
                    <label
                      key={role.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition cursor-pointer ${
                        isAssigned
                          ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
                          : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
                      } ${assignSaving ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={() => toggleUserRole(roleAssignUser.id, role.id)}
                        className="accent-[var(--accent)] w-4 h-4"
                      />
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: role.color || "#6b7280" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)]">{role.name}</div>
                        {role.description && (
                          <div className="text-xs text-[var(--text-muted)] truncate">{role.description}</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button onClick={() => setRoleAssignUser(null)} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition">
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PASSWORD RESET MODAL (SCH-557) ==================== */}
      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeResetModal}>
          <div className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Passwort zurücksetzen</h3>
                <p className="text-sm text-[var(--text-muted)]">{resetUser.display_name} — {resetUser.email}</p>
              </div>
              <button onClick={closeResetModal} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" title={t("common.close")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {!resetResult && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Das aktuelle Passwort wird sofort ungültig. Der User wird beim nächsten Login zur Passwort-Änderung gezwungen.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleResetPassword(resetUser, "email")}
                    disabled={resetBusy}
                    className="px-3 py-2 text-sm font-medium bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    {resetBusy ? "Wird zurückgesetzt…" : "Zurücksetzen + E-Mail senden"}
                  </button>
                  <button
                    onClick={() => handleResetPassword(resetUser, "show")}
                    disabled={resetBusy}
                    className="px-3 py-2 text-sm font-medium bg-[var(--surface)] border border-amber-500/40 text-amber-600 rounded-md hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
                  >
                    Nur zurücksetzen (Passwort anzeigen)
                  </button>
                </div>
              </div>
            )}

            {resetResult?.kind === "error" && (
              <div className="space-y-3">
                <p className="text-sm text-rose-500">{resetResult.message}</p>
                <button onClick={closeResetModal} className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">{t("common.close")}</button>
              </div>
            )}

            {resetResult?.kind === "sent" && (
              <div className="space-y-3">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-600">
                  E-Mail mit neuem Passwort wurde an {resetResult.email} gesendet.
                </div>
                <button onClick={closeResetModal} className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">{t("common.close")}</button>
              </div>
            )}

            {resetResult?.kind === "password" && (
              <div className="space-y-3">
                {resetResult.note && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300">
                    {resetResult.note}
                  </div>
                )}
                <div>
                  <label className="block text-xs uppercase tracking-wide text-[var(--text-muted)] mb-1">Temporäres Passwort</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={resetResult.tempPassword}
                      className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary)]"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      onClick={() => copyTempPassword(resetResult.tempPassword)}
                      className={`px-3 py-2 text-xs font-medium border rounded-md transition-colors ${
                        tempPwCopied
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"
                          : "bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                      }`}
                    >
                      {tempPwCopied ? "Kopiert ✓" : "Kopieren"}
                    </button>
                  </div>
                </div>
                {resetResult.email && (
                  <a
                    href={`mailto:${resetResult.email}?subject=${encodeURIComponent("Dein temporäres Passwort")}&body=${encodeURIComponent(`Hallo ${resetResult.displayName || resetResult.email},\n\ndein temporäres Passwort lautet:\n\n  ${resetResult.tempPassword}\n\nDu wirst beim nächsten Login zur Passwort-Änderung geführt.`)}`}
                    className="inline-block px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-black rounded-md hover:brightness-110 transition-colors"
                  >
                    Per E-Mail senden
                  </a>
                )}
                <div className="flex justify-end">
                  <button onClick={closeResetModal} className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">{t("common.close")}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SCHEDULE MODAL (unchanged) ==================== */}
      {scheduleUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setScheduleUser(null)}>
          <div className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t("admin.scheduleTitle")}</h3>
                <p className="text-sm text-[var(--text-muted)]">{scheduleUser.display_name} — {scheduleUser.email}</p>
              </div>
              <button onClick={() => setScheduleUser(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" title={t("common.close")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {scheduleLoading ? (
              <div className="py-10 text-center text-[var(--text-muted)] text-sm">{t("common.loading")}</div>
            ) : (
              <>
                {/* SCH-918 K2-G10 — overflow-x-auto so the 6-column schedule
                    table can be scrolled horizontally on phones; the modal
                    itself stays bounded by max-w-2xl. min-w-[640px] on the
                    table prevents columns from being squashed below their
                    minimum readable width. */}
                <div className="bg-[var(--background)] rounded-lg border border-[var(--border)] overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="bg-[var(--surface-hover)] text-[10px] uppercase text-[var(--text-muted)]">
                        <th className="px-3 py-2 text-left font-medium">{t("admin.scheduleDay")}</th>
                        <th className="px-3 py-2 text-left font-medium">{t("admin.scheduleActive")}</th>
                        <th className="px-3 py-2 text-left font-medium">{t("admin.scheduleFrom")}</th>
                        <th className="px-3 py-2 text-left font-medium">{t("admin.scheduleTo")}</th>
                        <th className="px-3 py-2 text-right font-medium">unbez. Pause</th>
                        <th className="px-3 py-2 text-right font-medium">{t("admin.scheduleDailyTarget")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {scheduleDraft.map((row) => {
                        // SCH-918 K2-G10 — show paid time, not gross window,
                        // so the "Auto" button restores window − break.
                        const derived = derivedTarget(row.start_time, row.end_time, row.unpaid_break_minutes);
                        const mismatchHint = row.enabled && row.target_override && derived > 0 && derived !== row.daily_target_minutes;
                        return (
                          <tr key={row.weekday} className={row.enabled ? "" : "opacity-40"}>
                            <td className="px-3 py-2 font-medium text-[var(--text-primary)] w-28">{t(`weekday.long.${row.weekday}` as TranslationKey)}</td>
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
                                  value={row.unpaid_break_minutes}
                                  disabled={!row.enabled}
                                  onChange={(e) => updateDraftRow(row.weekday, { unpaid_break_minutes: Math.max(0, Number(e.target.value) || 0) })}
                                  className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] w-20 text-right disabled:opacity-50"
                                />
                                <span className="text-[10px] text-[var(--text-muted)] w-8">min</span>
                              </div>
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
                                      {mismatchHint ? t("admin.scheduleResetToSpan", { hours: formatMinutesAsHours(derived) }) : t("admin.scheduleAuto")}
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
                        <td className="px-3 py-2 font-semibold text-[var(--text-secondary)]" colSpan={5}>{t("admin.scheduleWeeklyTotal")}</td>
                        <td className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">
                          {formatMinutesAsHours(weekTotalMinutes)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-[var(--text-muted)]">
                    {t("admin.scheduleAutoHint")}
                  </p>
                  <div className="flex items-center gap-3">
                    {scheduleSaved && <span className="text-xs text-emerald-400 font-medium">{t("common.saved")}</span>}
                    <button onClick={() => setScheduleUser(null)} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition">
                      {t("common.close")}
                    </button>
                    <button onClick={saveSchedule} disabled={scheduleSaving}
                      className="bg-[var(--brand-orange)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
                      {scheduleSaving ? t("common.saving") : t("common.save")}
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
