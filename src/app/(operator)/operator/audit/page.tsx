"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface AuditEntry {
  id: string;
  operator_id: string;
  operator_name: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  "company.create": "Firma erstellt",
  "company.active": "Firma aktiviert",
  "company.suspended": "Firma gesperrt",
  "company.cancelled": "Firma gekündigt",
  "company.plan_change": "Plan geändert",
  "company.update": "Firma aktualisiert",
  "user.suspend": "User gesperrt",
  "user.unsuspend": "Sperre aufgehoben",
  "user.password_reset": "Passwort-Reset",
};

export default function OperatorAudit() {
  const router = useRouter();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => { loadAudit(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAudit() {
    setLoading(true);
    const res = await fetch(`/api/operator/audit-log?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
    if (res.status === 403 || res.status === 401) {
      router.push(res.status === 401 ? "/login" : "/operator");
      return;
    }
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setEntries(data.data);
    setTotal(data.total);
    setLoading(false);
  }

  if (loading && entries.length === 0) {
    return <div className="text-[var(--text-muted)] text-sm py-8 text-center">Lade Audit Log...</div>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--text-primary)] mb-4">Audit Log</h1>
      <p className="text-xs text-[var(--text-muted)] mb-4">{total} Einträge insgesamt</p>

      {entries.length === 0 ? (
        <div className="text-center text-[var(--text-muted)] text-sm py-8">
          Noch keine Operator-Aktionen aufgezeichnet.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {ACTION_LABELS[entry.action] || entry.action}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      von {entry.operator_name}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    {entry.target_type}: <span className="font-mono">{entry.target_id}</span>
                  </div>
                  {entry.details && Object.keys(entry.details).length > 0 && (
                    <div className="text-xs text-[var(--text-muted)] mt-1 font-mono bg-[var(--background)] rounded px-2 py-1">
                      {JSON.stringify(entry.details)}
                    </div>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleString("de-AT")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-md disabled:opacity-30 hover:bg-[var(--surface-hover)] transition-colors"
          >
            Zurück
          </button>
          <span className="px-3 py-1.5 text-xs text-[var(--text-muted)]">
            Seite {page + 1} von {Math.ceil(total / PAGE_SIZE)}
          </span>
          <button
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-md disabled:opacity-30 hover:bg-[var(--surface-hover)] transition-colors"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
