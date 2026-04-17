"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface UserRow {
  id: string;
  auth_user_id: string;
  display_name: string;
  email: string;
  role: string;
  is_superadmin: boolean;
  created_at: string;
  companies: Array<{ company_id: string; company_name: string; role: string }>;
  banned: boolean;
  last_sign_in: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  manager: "Geschäftsführer",
  accountant: "Buchhalter",
  employee: "Mitarbeiter",
};

export default function OperatorUsers() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionUser, setActionUser] = useState<UserRow | null>(null);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    const res = await fetch("/api/operator/users");
    if (res.status === 403 || res.status === 401) {
      router.push(res.status === 401 ? "/login" : "/operator");
      return;
    }
    if (!res.ok) { setLoading(false); return; }
    setUsers(await res.json());
    setLoading(false);
  }

  async function handleAction(userId: string, action: string, email?: string) {
    await fetch("/api/operator/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_user_id: userId, action, plan: email }),
    });
    await loadUsers();
    setActionUser(null);
  }

  const filtered = users.filter(
    (u) =>
      u.display_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.companies.some((c) => c.company_name.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div className="text-[var(--text-muted)] text-sm py-8 text-center">Lade User...</div>;

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--text-primary)] mb-4">User-Management</h1>

      <input
        type="text"
        placeholder="User oder Firma suchen..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50"
      />

      <div className="space-y-2">
        {filtered.map((u) => (
          <div key={u.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 hover:border-[var(--text-muted)] transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-[var(--text-primary)]">{u.display_name || "Kein Name"}</span>
                  {u.is_superadmin && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-rose-500/10 text-rose-500 rounded">SUPERADMIN</span>
                  )}
                  {u.banned && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/10 text-red-600 rounded">GESPERRT</span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{u.email}</div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs text-[var(--text-secondary)]">
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                  {u.companies.length > 0 && (
                    <span className="text-xs text-[var(--text-muted)]">
                      {u.companies.map((c) => c.company_name).join(", ")}
                    </span>
                  )}
                  {u.last_sign_in && (
                    <span className="text-xs text-[var(--text-muted)]">
                      Letzter Login: {new Date(u.last_sign_in).toLocaleDateString("de-AT")}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setActionUser(u)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                Aktionen
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-[var(--text-muted)] text-sm py-8">
          {search ? "Kein User gefunden" : "Keine User registriert"}
        </div>
      )}

      {/* Action Modal */}
      {actionUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">{actionUser.display_name}</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">{actionUser.email}</p>
            <div className="space-y-2">
              {!actionUser.banned ? (
                <button
                  onClick={() => handleAction(actionUser.auth_user_id, "suspend")}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-rose-500/10 text-rose-500 transition-colors"
                >
                  Account sperren
                </button>
              ) : (
                <button
                  onClick={() => handleAction(actionUser.auth_user_id, "unsuspend")}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-emerald-500/10 text-emerald-500 transition-colors"
                >
                  Sperre aufheben
                </button>
              )}
              <button
                onClick={() => handleAction(actionUser.auth_user_id, "reset_password", actionUser.email)}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] transition-colors"
              >
                Passwort-Reset Link generieren
              </button>
            </div>
            <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 mt-3 text-xs text-[var(--text-muted)]">
              <div>Rolle: {ROLE_LABELS[actionUser.role] || actionUser.role}</div>
              <div>Firmen: {actionUser.companies.map((c) => `${c.company_name} (${c.role})`).join(", ") || "Keine"}</div>
              <div>Erstellt: {new Date(actionUser.created_at).toLocaleDateString("de-AT")}</div>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setActionUser(null)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
