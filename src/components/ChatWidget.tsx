// SCH-483 — Floating in-app help chatbot, bottom-right, for authenticated
// users. Hidden for unauthenticated / superadmin-only routes.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/lib/company-context";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "superadmin" | "system";
  content: string;
  created_at: string;
}

const STORAGE_KEY_CONV = "chatWidget.conversationId";
const POLL_INTERVAL_MS = 10_000;

export function ChatWidget() {
  const { company, roleLoaded } = useCompany();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationStatus, setConversationStatus] = useState<string>("active");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auth check — don't render for logged-out users.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setAuthed(false);
      else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") setAuthed(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Restore persisted conversation id.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY_CONV);
    if (stored) setConversationId(stored);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages || []);
    setConversationStatus(data.conversation?.status || "active");
  }, []);

  // Load messages when conversation id changes OR when panel opens.
  useEffect(() => {
    if (!conversationId || !open) return;
    loadConversation(conversationId);
  }, [conversationId, open, loadConversation]);

  // Poll for superadmin replies while panel is open + conversation is escalated.
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!open || !conversationId) return;
    pollRef.current = setInterval(() => {
      loadConversation(conversationId);
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, conversationId, loadConversation]);

  // Auto-scroll to latest.
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);

    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setInput("");

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          companyId: company.id,
          content,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        localStorage.setItem(STORAGE_KEY_CONV, data.conversationId);
      }
      // Reload to get canonical message IDs + any new super admin replies.
      await loadConversation(data.conversationId || conversationId!);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((m) => [
        ...m,
        {
          id: `err-${Date.now()}`,
          role: "system",
          content: `Fehler: ${message}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, conversationId, company.id, loadConversation]);

  const escalate = useCallback(async () => {
    if (!conversationId || escalating) return;
    setEscalating(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/escalate`, { method: "POST" });
      if (res.ok) await loadConversation(conversationId);
    } finally {
      setEscalating(false);
    }
  }, [conversationId, escalating, loadConversation]);

  const startNew = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setConversationStatus("active");
    localStorage.removeItem(STORAGE_KEY_CONV);
  }, []);

  const showWidget = useMemo(() => {
    if (!roleLoaded) return false;
    if (authed === false) return false;
    return true;
  }, [authed, roleLoaded]);

  if (!showWidget) return null;

  return (
    <>
      {/* Floating launcher button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Hilfe"
          title="Hilfe"
          className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full bg-[var(--brand-orange)] text-white shadow-lg hover:brightness-110 transition flex items-center justify-center"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(380px,calc(100vw-2.5rem))] h-[min(560px,calc(100vh-2.5rem))] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-full bg-[var(--brand-orange)] text-white flex items-center justify-center text-xs font-bold shrink-0">
                O
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)] truncate">Orange Octo Hilfe</div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">
                  {conversationStatus === "escalated"
                    ? "Weitergeleitet — Superadmin antwortet"
                    : conversationStatus === "resolved"
                    ? "Gelöst"
                    : "AI-Assistent — bei Bedarf an Superadmin"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={startNew}
                title="Neues Gespräch"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Schließen"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-[var(--bg,var(--surface))]">
            {messages.length === 0 && (
              <div className="text-xs text-[var(--text-muted)] text-center mt-6 px-4">
                Hallo! Ich helfe dir bei der Bedienung der App — frag mich z.B. wie du eine Rechnung erstellst,
                einen Beleg hochlädst oder das Design anpasst. Wenn ich nicht weiterhelfen kann, leite ich an einen
                Superadmin weiter.
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {sending && (
              <div className="text-[10px] text-[var(--text-muted)] px-1">Assistent schreibt...</div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border)] p-2 bg-[var(--surface)]">
            {conversationStatus !== "escalated" && conversationId && messages.length > 0 && (
              <div className="flex justify-end mb-1">
                <button
                  onClick={escalate}
                  disabled={escalating}
                  className="text-[10px] text-rose-500 hover:text-rose-600 disabled:opacity-50"
                >
                  {escalating ? "Leite weiter..." : "Human anfordern"}
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Frag mich etwas..."
                rows={1}
                disabled={sending}
                className="flex-1 resize-none bg-[var(--surface-hover)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-orange)] max-h-28"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="bg-[var(--brand-orange)] text-white rounded-md px-3 py-1.5 text-xs font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Senden
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="text-[10px] text-[var(--text-muted)] text-center italic px-2 py-1">
        {message.content}
      </div>
    );
  }
  const isUser = message.role === "user";
  const isSuper = message.role === "superadmin";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs whitespace-pre-wrap break-words ${
          isUser
            ? "bg-[var(--brand-orange)] text-white"
            : isSuper
            ? "bg-rose-500/10 border border-rose-500/30 text-[var(--text-primary)]"
            : "bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)]"
        }`}
      >
        {isSuper && (
          <div className="text-[9px] font-semibold uppercase tracking-wider text-rose-500 mb-0.5">
            Superadmin
          </div>
        )}
        {message.content}
      </div>
    </div>
  );
}
