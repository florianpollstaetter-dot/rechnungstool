// SCH-483 — Superadmin chat inbox: list + detail view in one two-pane layout.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ConversationSummary {
  id: string;
  company_id: string;
  company_name: string;
  user_id: string;
  user_label: string;
  title: string | null;
  status: "active" | "escalated" | "resolved" | "closed";
  is_bug_report?: boolean;
  escalated_at: string | null;
  last_message_at: string;
  last_message_role: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "superadmin" | "system";
  content: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  author_user_id: string | null;
}

interface ConversationDetail extends ConversationSummary {
  resolved_at: string | null;
  created_at: string;
}

type StatusFilter = "escalated" | "bugs" | "all" | "active" | "resolved";

const FILTER_LABELS: Record<StatusFilter, string> = {
  escalated: "Weitergeleitet",
  bugs: "Bugs",
  active: "Aktiv",
  resolved: "Gelöst",
  all: "Alle",
};

const POLL_MS = 15_000;

export default function OperatorChatInbox() {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("escalated");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ conversation: ConversationDetail; messages: ChatMessage[] } | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async (currentFilter: StatusFilter) => {
    const qs = currentFilter === "all" ? "" : `?status=${currentFilter}`;
    const res = await fetch(`/api/operator/chat${qs}`);
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { setAuthorized(false); setLoading(false); return; }
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setConversations(data.conversations || []);
    setAuthorized(true);
    setLoading(false);
  }, [router]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/operator/chat/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setDetail(data);
  }, []);

  useEffect(() => {
    loadList(filter);
  }, [filter, loadList]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    loadDetail(selectedId);
    const iv = setInterval(() => loadDetail(selectedId), POLL_MS);
    return () => clearInterval(iv);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!detailRef.current) return;
    detailRef.current.scrollTop = detailRef.current.scrollHeight;
  }, [detail]);

  const send = useCallback(async () => {
    if (!selectedId || !reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/operator/chat/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (res.ok) {
        setReply("");
        await Promise.all([loadDetail(selectedId), loadList(filter)]);
      }
    } finally {
      setSending(false);
    }
  }, [selectedId, reply, sending, loadDetail, loadList, filter]);

  const resolve = useCallback(async () => {
    if (!selectedId || resolving) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/operator/chat/${selectedId}/resolve`, { method: "POST" });
      if (res.ok) await Promise.all([loadDetail(selectedId), loadList(filter)]);
    } finally {
      setResolving(false);
    }
  }, [selectedId, resolving, loadDetail, loadList, filter]);

  const sortedConversations = useMemo(() => conversations, [conversations]);

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm py-8 text-center">Lade Chat-Inbox...</div>;
  }
  if (!authorized) {
    return (
      <div className="text-center py-8">
        <div className="text-rose-500 text-lg font-semibold mb-2">Zugriff verweigert</div>
        <div className="text-[var(--text-muted)] text-sm">Nur Superadmins können die Chat-Inbox verwenden.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Chat-Inbox</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">Kunden-Chatbot-Gespräche (SCH-483)</p>
        </div>
        <div className="flex gap-1 text-xs">
          {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md ${filter === f ? "bg-[var(--surface-hover)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 min-h-[60vh]">
        {/* List pane */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col">
          {sortedConversations.length === 0 ? (
            <div className="text-center text-[var(--text-muted)] text-xs py-8 px-3">Keine Gespräche in dieser Ansicht.</div>
          ) : (
            <div className="divide-y divide-[var(--border)] overflow-y-auto">
              {sortedConversations.map((c) => {
                const active = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${active ? "bg-[var(--surface-hover)]" : "hover:bg-[var(--surface-hover)]"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{c.title || "Gespräch"}</div>
                      <div className="flex items-center gap-1 shrink-0">
                        {c.is_bug_report && <BugBadge />}
                        <StatusPill status={c.status} />
                      </div>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                      {c.company_name} · {c.user_label}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {new Date(c.last_message_at).toLocaleString("de-AT")}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail pane */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg flex flex-col overflow-hidden">
          {!detail ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
              {selectedId ? "Lade Gespräch..." : "Links ein Gespräch auswählen."}
            </div>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {detail.conversation.title || "Gespräch"}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {detail.conversation.company_name} · {detail.conversation.user_label}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {detail.conversation.is_bug_report && <BugBadge />}
                  <StatusPill status={detail.conversation.status} />
                  {detail.conversation.status !== "resolved" && (
                    <button
                      onClick={resolve}
                      disabled={resolving}
                      className="text-xs px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-md hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      {resolving ? "..." : "Gelöst"}
                    </button>
                  )}
                </div>
              </div>

              <div ref={detailRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                {detail.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>

              <div className="border-t border-[var(--border)] p-2">
                <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    rows={1}
                    placeholder="Antwort als Superadmin..."
                    className="flex-1 resize-none bg-[var(--surface-hover)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs max-h-28 focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="submit"
                    disabled={sending || !reply.trim()}
                    className="bg-rose-500 text-white rounded-md px-3 py-1.5 text-xs font-medium hover:bg-rose-600 disabled:opacity-50"
                  >
                    {sending ? "..." : "Senden"}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BugBadge() {
  return (
    <span
      title="Bug-Report aus dem In-App-Chat"
      className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border bg-red-600 text-white border-red-700"
    >
      BUG
    </span>
  );
}

function StatusPill({ status }: { status: ConversationSummary["status"] }) {
  const map: Record<ConversationSummary["status"], { label: string; cls: string }> = {
    active: { label: "Aktiv", cls: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
    escalated: { label: "Weitergeleitet", cls: "bg-rose-500/10 text-rose-500 border-rose-500/30" },
    resolved: { label: "Gelöst", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
    closed: { label: "Geschlossen", cls: "bg-gray-500/10 text-gray-400 border-gray-500/30" },
  };
  const { label, cls } = map[status];
  return <span className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    const meta = message.metadata as
      | {
          kind?: string;
          issue_identifier?: string | null;
          issue_link?: string | null;
          reproduce_steps?: string | null;
          expected?: string | null;
          actual?: string | null;
          browser?: string | null;
        }
      | null
      | undefined;
    if (meta?.kind === "bug_report") {
      return (
        <div className="rounded-md border border-red-600/40 bg-red-600/5 text-[var(--text-primary)] px-2.5 py-2 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">BUG</span>
            <span className="text-[10px] text-[var(--text-muted)]">{message.content}</span>
            {meta.issue_link && meta.issue_identifier && (
              <a
                href={meta.issue_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-semibold text-red-500 hover:underline"
              >
                {meta.issue_identifier} →
              </a>
            )}
          </div>
          <div className="grid grid-cols-1 gap-1 text-[11px] leading-snug">
            {meta.reproduce_steps && (
              <div><span className="font-semibold">Was passiert:</span> {meta.reproduce_steps}</div>
            )}
            {meta.expected && (
              <div><span className="font-semibold">Erwartet:</span> {meta.expected}</div>
            )}
            {meta.actual && (
              <div><span className="font-semibold">Stattdessen:</span> {meta.actual}</div>
            )}
            {meta.browser && (
              <div className="text-[10px] text-[var(--text-muted)]">{meta.browser}</div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="text-[10px] text-[var(--text-muted)] italic text-center px-2 py-1">{message.content}</div>
    );
  }
  const isUser = message.role === "user";
  const isSuper = message.role === "superadmin";
  const align = isUser ? "justify-start" : "justify-end";
  const color = isUser
    ? "bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)]"
    : isSuper
    ? "bg-rose-500 text-white"
    : "bg-[var(--brand-orange)] text-white";
  const label = isUser ? "Kunde" : isSuper ? "Superadmin" : "Assistent";
  return (
    <div className={`flex ${align}`}>
      <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs whitespace-pre-wrap break-words ${color}`}>
        <div className="text-[9px] font-semibold uppercase tracking-wider opacity-80 mb-0.5">{label}</div>
        {message.content}
      </div>
    </div>
  );
}
