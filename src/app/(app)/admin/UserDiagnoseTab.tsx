"use client";

// SCH-829 — Admin User-Diagnose tab.
// Self-serve cleanup for orphan auth.users + ghost user_profiles entries.
// Strings are German-only for the initial drop; translations follow once the
// flow stabilises.
import { useState } from "react";

type AuthUserSlim = {
  id: string;
  email: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
};

type ProfileRow = {
  id: string;
  auth_user_id: string | null;
  display_name: string | null;
  email: string | null;
  role: string | null;
  company_access: string | null;
  created_at: string | null;
  is_superadmin: boolean | null;
};

type MembershipRow = {
  company_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type RoleAssignmentRow = {
  id: string;
  company_id: string;
  user_id: string;
  role_id: string;
  created_at: string;
};

type DiagnoseResult = {
  email: string;
  authUser: AuthUserSlim | null;
  profiles: ProfileRow[];
  memberships: MembershipRow[];
  roleAssignments: RoleAssignmentRow[];
  isOrphan: boolean;
  orphanReasons: string[];
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function UserDiagnoseTab() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  async function runDiagnose(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setDeleteResult(null);
    setConfirmEmail("");
    if (!email.trim()) {
      setError("E-Mail ist erforderlich.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/user-diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      setResult(data as DiagnoseResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function runHardDelete() {
    if (!result) return;
    setError(null);
    setDeleteResult(null);
    if (confirmEmail.trim().toLowerCase() !== result.email.toLowerCase()) {
      setError("Bestätigung muss exakt der gesuchten E-Mail entsprechen.");
      return;
    }
    if (
      !window.confirm(
        `Wirklich alle DB-Einträge für ${result.email} unwiderruflich löschen?\n` +
          "Diese Aktion ist nicht rückgängig zu machen.",
      )
    ) {
      return;
    }
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/admin/user-diagnose", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: result.email, confirm_email: confirmEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      const warnings: string[] = data?.deletion_warnings || [];
      setDeleteResult(
        warnings.length === 0
          ? `OK — ${data.deleted_auth_user_ids?.length ?? 0} auth-Einträge gelöscht.`
          : `OK mit Warnungen: ${warnings.join("; ")}`,
      );
      setResult(null);
      setConfirmEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">User-Diagnose</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
          Überprüft <code>auth.users</code>, <code>user_profiles</code>, <code>company_members</code>{" "}
          und <code>user_role_assignments</code> für eine E-Mail-Adresse. Erkennt
          Orphan-Einträge (z.&nbsp;B. wenn eine User-Anlage abgebrochen ist) und erlaubt das harte
          Löschen aller zugehörigen Datensätze als Selbsthilfe.
        </p>
      </div>

      <form onSubmit={runDiagnose} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              E-Mail-Adresse
            </label>
            <input
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="z.B. henny@example.com"
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
          >
            {loading ? "Suche…" : "Diagnose starten"}
          </button>
        </div>
        {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
        {deleteResult && <p className="text-sm text-emerald-400 mt-3">{deleteResult}</p>}
      </form>

      {result && (
        <div className="space-y-4">
          {result.isOrphan ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <strong className="text-amber-300">Orphan-State erkannt:</strong>
              <ul className="list-disc list-inside mt-1 text-amber-200/80">
                {result.orphanReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Kein Orphan-State — alle Tabellen sind konsistent.
            </div>
          )}

          <Section title="auth.users">
            {result.authUser ? (
              <KeyValueGrid
                rows={[
                  ["id", result.authUser.id],
                  ["email", result.authUser.email || "—"],
                  ["created_at", formatDate(result.authUser.created_at)],
                  ["email_confirmed_at", formatDate(result.authUser.email_confirmed_at)],
                  ["last_sign_in_at", formatDate(result.authUser.last_sign_in_at)],
                  ["raw_app_meta_data", JSON.stringify(result.authUser.raw_app_meta_data)],
                  ["raw_user_meta_data", JSON.stringify(result.authUser.raw_user_meta_data)],
                ]}
              />
            ) : (
              <Empty>Keine Zeile in auth.users.</Empty>
            )}
          </Section>

          <Section title={`user_profiles (${result.profiles.length})`}>
            {result.profiles.length === 0 ? (
              <Empty>Keine Zeile in user_profiles.</Empty>
            ) : (
              <Table
                columns={["id", "auth_user_id", "display_name", "email", "role", "company_access", "is_superadmin", "created_at"]}
                rows={result.profiles.map((p) => [
                  p.id,
                  p.auth_user_id ?? "—",
                  p.display_name ?? "—",
                  p.email ?? "—",
                  p.role ?? "—",
                  p.company_access ?? "—",
                  String(p.is_superadmin ?? false),
                  formatDate(p.created_at),
                ])}
              />
            )}
          </Section>

          <Section title={`company_members (${result.memberships.length})`}>
            {result.memberships.length === 0 ? (
              <Empty>Keine Firmen-Zuordnung.</Empty>
            ) : (
              <Table
                columns={["company_id", "user_id", "role", "created_at"]}
                rows={result.memberships.map((m) => [
                  m.company_id,
                  m.user_id,
                  m.role,
                  formatDate(m.created_at),
                ])}
              />
            )}
          </Section>

          <Section title={`user_role_assignments (${result.roleAssignments.length})`}>
            {result.roleAssignments.length === 0 ? (
              <Empty>Keine Custom-Rollen-Zuordnungen.</Empty>
            ) : (
              <Table
                columns={["id", "company_id", "user_id", "role_id", "created_at"]}
                rows={result.roleAssignments.map((r) => [
                  r.id,
                  r.company_id,
                  r.user_id,
                  r.role_id,
                  formatDate(r.created_at),
                ])}
              />
            )}
          </Section>

          <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl p-4 space-y-3">
            <div className="text-sm text-rose-200 font-semibold">Hart löschen</div>
            <p className="text-xs text-rose-200/80">
              Entfernt unwiderruflich alle Zeilen in <code>user_role_assignments</code>,{" "}
              <code>company_members</code>, <code>user_profiles</code> und <code>auth.users</code>{" "}
              für diese E-Mail. Aktion wird im Audit-Log protokolliert.
            </p>
            <input
              type="email"
              value={confirmEmail}
              onChange={(ev) => setConfirmEmail(ev.target.value)}
              placeholder={`Tippe „${result.email}" zur Bestätigung`}
              className="w-full bg-[var(--background)] border border-rose-500/40 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
            <button
              type="button"
              onClick={runHardDelete}
              disabled={deleteBusy || confirmEmail.trim().toLowerCase() !== result.email.toLowerCase()}
              className="bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-rose-600 transition disabled:opacity-50"
            >
              {deleteBusy ? "Lösche…" : "User komplett löschen"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)]">
      <div className="px-4 py-2 border-b border-[var(--border)] text-xs font-semibold uppercase text-[var(--text-muted)]">
        {title}
      </div>
      <div className="p-4 text-sm">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[var(--text-muted)] italic">{children}</div>;
}

function KeyValueGrid({ rows }: { rows: Array<[string, string | null]> }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs font-mono">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-[var(--text-muted)]">{k}</dt>
          <dd className="text-[var(--text-primary)] break-all">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs font-mono">
        <thead>
          <tr className="text-[var(--text-muted)] uppercase">
            {columns.map((c) => (
              <th key={c} className="text-left px-2 py-1 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-[var(--border)]">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 align-top break-all">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
