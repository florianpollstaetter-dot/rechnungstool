"use client";

// SCH-825 M8 — Header bell. Shows unread count badge; click opens a
// dropdown with recent notifications. Polls every 30s as a stop-gap until
// M10 swaps in Realtime. Click on a row marks-read + navigates to the
// task's project page (anchor jump to task row).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  TYPE_LABEL,
  type PmNotificationWithTask,
} from "@/lib/pm/notifications";

const POLL_MS = 30_000;

type ApiResponse = {
  notifications: PmNotificationWithTask[];
  unread_count: number;
};

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [marking, setMarking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch("/api/pm/notifications?limit=20");
    if (!res.ok) return;
    const json = (await res.json()) as ApiResponse;
    setData(json);
  }

  useEffect(() => {
    // load() awaits a fetch before touching state, so it's not a sync
    // setState-in-effect; the lint rule can't tell. Disabled for this
    // line + the polling tick below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(t);
  }, []);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    setMarking(true);
    await fetch("/api/pm/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setMarking(false);
    await load();
  }

  async function markAllRead() {
    setMarking(true);
    await fetch("/api/pm/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setMarking(false);
    await load();
  }

  function deepLink(n: PmNotificationWithTask): string {
    if (!n.task) return `/pm/${n.workspace_id}`;
    return `/pm/${n.workspace_id}/projects/${n.task.project_id}#task-${n.task_id}`;
  }

  const unread = data?.unread_count ?? 0;
  const list = data?.notifications ?? [];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded-md"
        aria-label={`Benachrichtigungen (${unread} ungelesen)`}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-medium rounded-full min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
            <span className="text-sm font-medium">Benachrichtigungen</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={marking}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                Alle als gelesen
              </button>
            )}
          </div>

          {list.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] px-4 py-6 text-center">
              Nichts Neues.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-[var(--border)]">
              {list.map((n) => {
                const isUnread = n.read_at === null;
                return (
                  <li key={n.id}>
                    <Link
                      href={deepLink(n)}
                      onClick={() => {
                        if (isUnread) markRead([n.id]);
                        setOpen(false);
                      }}
                      className={`block px-4 py-3 hover:bg-[var(--surface-hover)] ${
                        isUnread ? "bg-[var(--background)]" : ""
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                          {TYPE_LABEL[n.type]}
                        </span>
                        <time
                          dateTime={n.created_at}
                          className="text-xs text-[var(--text-muted)]"
                        >
                          {new Date(n.created_at).toLocaleString("de-DE", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </time>
                      </div>
                      <p className="text-sm mt-0.5 truncate">
                        {n.task?.title ?? "(Aufgabe entfernt)"}
                      </p>
                      {isUnread && (
                        <span
                          aria-hidden
                          className="inline-block w-1.5 h-1.5 bg-[var(--accent)] rounded-full mt-1"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
