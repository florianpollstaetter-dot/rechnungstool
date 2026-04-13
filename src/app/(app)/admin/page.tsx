"use client";

import { useState, useEffect, useCallback } from "react";
import { UserProfile } from "@/lib/types";
import { getUserProfiles, createUserProfile, updateUserProfile, deleteUserProfile } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { COMPANIES } from "@/lib/company-context";

export default function AdminPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("user");
  const [form, setForm] = useState({ email: "", password: "", display_name: "", role: "user" as "admin" | "user", company_access: ["vrthefans"] as string[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
        company_access: form.company_access,
      });

      setForm({ email: "", password: "", display_name: "", role: "user", company_access: ["vrthefans"] });
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

  async function handleDelete(id: string) {
    if (confirm("Benutzer wirklich löschen?")) {
      await deleteUserProfile(id);
      await loadData();
    }
  }

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
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "user" })} className={inputClass}>
                <option value="user">Benutzer</option>
                <option value="admin">Administrator</option>
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
            <button type="button" onClick={() => setShowForm(false)} className="bg-[var(--surface-hover)] text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition">
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
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[var(--surface-hover)] transition">
                <td className="px-4 py-3 text-sm font-medium text-[var(--text-primary)]">{u.display_name}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-gray-500/15 text-gray-400"}`}>
                    {u.role === "admin" ? "Admin" : "Benutzer"}
                  </span>
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
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(u.id)} className="text-sm text-rose-400 hover:text-rose-300">Löschen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
