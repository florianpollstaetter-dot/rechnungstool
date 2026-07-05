"use client";

// SCH-825 M1 — Members table with admin actions. Admins can change roles +
// remove anyone; non-admins see read-only with a single "Workspace verlassen"
// action on their own row.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Member = {
  user_id: string;
  role: "admin" | "member" | "guest";
  created_at: string;
  display_name: string;
  email: string;
};

const ROLES: Array<"admin" | "member" | "guest"> = ["admin", "member", "guest"];

export function MembersTable({
  workspaceId,
  members,
  currentUserId,
  isAdmin,
}: {
  workspaceId: string;
  members: Member[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function changeRole(userId: string, nextRole: Member["role"]) {
    setError(null);
    setPendingId(userId);
    const res = await fetch(
      `/api/pm/workspaces/${workspaceId}/members/${userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      },
    );
    const json = await res.json().catch(() => ({}));
    setPendingId(null);
    if (!res.ok) {
      setError(json.error ?? "Rolle konnte nicht geändert werden");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function removeMember(userId: string, isSelf: boolean) {
    const confirmMsg = isSelf
      ? "Workspace wirklich verlassen?"
      : "Mitglied wirklich entfernen?";
    if (!window.confirm(confirmMsg)) return;
    setError(null);
    setPendingId(userId);
    const res = await fetch(
      `/api/pm/workspaces/${workspaceId}/members/${userId}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => ({}));
    setPendingId(null);
    if (!res.ok) {
      setError(json.error ?? "Entfernen fehlgeschlagen");
      return;
    }
    if (isSelf) {
      router.push("/pm");
      router.refresh();
    } else {
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-hover)] text-xs uppercase text-[var(--text-muted)]">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">E-Mail</th>
              <th className="text-left px-4 py-3 font-medium">Rolle</th>
              <th className="text-right px-4 py-3 font-medium">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {members.map((m) => {
              const isSelf = m.user_id === currentUserId;
              const busy = pendingId === m.user_id;
              return (
                <tr key={m.user_id}>
                  <td className="px-4 py-3">
                    {m.display_name || (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                    {isSelf && (
                      <span className="ml-2 text-[10px] uppercase text-[var(--text-muted)]">
                        Du
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {m.email || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && !isSelf ? (
                      <select
                        value={m.role}
                        disabled={busy}
                        onChange={(e) =>
                          changeRole(m.user_id, e.target.value as Member["role"])
                        }
                        className="bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-1 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs uppercase tracking-wide">
                        {m.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(isAdmin || isSelf) ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeMember(m.user_id, isSelf)}
                        className="text-xs text-red-300 hover:text-red-200 disabled:opacity-40"
                      >
                        {isSelf ? "Verlassen" : "Entfernen"}
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
