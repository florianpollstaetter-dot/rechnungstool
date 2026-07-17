"use client";

// ORA-2854 D1 — replaces blocking native alert/confirm/prompt with in-app UI.
// Provides a promise-based imperative API so `if (confirm(...))` sites become
// `if (await confirm(...))` with minimal structural change, and alert() becomes
// a non-blocking toast via notify().

import { createContext, useCallback, useContext, useRef, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import PromptModal from "./PromptModal";

type ConfirmOptions = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

type PromptOptions = {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  allowEmpty?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ToastKind = "error" | "success" | "info";
type Toast = { id: number; message: string; kind: ToastKind };

interface DialogApi {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  notify: (message: string, kind?: ToastKind) => void;
}

const DialogContext = createContext<DialogApi | null>(null);

type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };
type PromptState = PromptOptions & { resolve: (value: string | null) => void };

function toastClass(kind: ToastKind): string {
  switch (kind) {
    case "error":
      return "border-rose-500/40 bg-rose-500/10 text-rose-100";
    case "success":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
    default:
      return "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]";
  }
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const opts = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve }));
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => setPromptState({ ...options, resolve }));
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, prompt, notify }}>
      {children}

      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          tone={confirmState.tone}
          onConfirm={() => {
            confirmState.resolve(true);
            setConfirmState(null);
          }}
          onCancel={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
        />
      )}

      {promptState && (
        <PromptModal
          title={promptState.title}
          placeholder={promptState.placeholder}
          defaultValue={promptState.defaultValue}
          allowEmpty={promptState.allowEmpty}
          confirmLabel={promptState.confirmLabel}
          cancelLabel={promptState.cancelLabel}
          onConfirm={(value) => {
            promptState.resolve(value);
            setPromptState(null);
          }}
          onCancel={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
        />
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="alert"
              className={`rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${toastClass(t.kind)}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex-1 whitespace-pre-line">{t.message}</span>
                <button
                  type="button"
                  aria-label="Schließen"
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                  className="opacity-70 hover:opacity-100 transition"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within a DialogProvider");
  return ctx;
}
