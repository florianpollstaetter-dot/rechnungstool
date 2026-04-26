"use client";

// SCH-825 M1 — Invite-by-email form. MVP requires invitee to already have an
// Orange-Octo account; if not, the API returns 404 and we surface a clear msg.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const ROLES: Array<{ value: "admin" | "member" | "guest"; label: string }> = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
  { value: "guest", label: "Guest (read-only)" },
];

export function InviteMemberForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "guest">("member");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const res = await fetch(`/api/pm/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    const json = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      setError(json.error ?? "Einladung fehlgeschlagen");
      return;
    }
    setSuccess(`${email} wurde als ${role} hinzugefügt.`);
    setEmail("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            E-Mail
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kollege@firma.at"
            className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Rolle
          </span>
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "admin" | "member" | "guest")
            }
            className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={submitting || pending || !email.trim()}
          className="self-end bg-[var(--accent)] text-black font-medium rounded-md px-4 py-2 text-sm disabled:opacity-50"
        >
          {submitting ? "Sende…" : "Einladen"}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-green-300 bg-green-500/10 border border-green-500/40 rounded-md px-3 py-2">
          {success}
        </div>
      )}
    </form>
  );
}
