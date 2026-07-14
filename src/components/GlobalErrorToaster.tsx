"use client";

// ORA-2809 C1: safety net for mutating actions whose errors were never caught
// by their caller. A failed insert/update used to reject a promise that nobody
// awaited, so the click "did nothing" and the error only showed in the console.
// This listens for unhandled promise rejections (and window errors) and turns
// them into a visible, dismissible German toast via humanizeDbError().
//
// Per-form inline error handling is still preferred; this only guarantees no
// mutation fails completely silently.

import { useEffect, useState } from "react";
import Link from "next/link";
import { humanizeDbErrorDetailed, type HumanizedError } from "@/lib/db-error";

interface ToastItem extends HumanizedError {
  id: number;
}

function looksLikeDbMutation(raw: string): boolean {
  const lc = raw.toLowerCase();
  return (
    lc.includes("failed:") ||
    lc.includes("returned no row") ||
    lc.includes("ueberfaellig") ||
    lc.includes("überfällig") ||
    lc.includes("funktionen eingeschr") ||
    lc.includes("could not find") ||
    lc.includes("row-level security") ||
    lc.includes("duplicate key") ||
    lc.includes("unique constraint") ||
    lc.includes("failed to fetch")
  );
}

export function GlobalErrorToaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    let counter = 0;
    const push = (err: unknown) => {
      const detailed = humanizeDbErrorDetailed(err);
      const id = ++counter;
      setToasts((prev) => [...prev, { ...detailed, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 8000);
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const raw = reason instanceof Error ? reason.message : String(reason ?? "");
      if (!looksLikeDbMutation(raw)) return;
      e.preventDefault();
      push(reason);
    };
    const onError = (e: ErrorEvent) => {
      const raw = e.error instanceof Error ? e.error.message : String(e.message ?? "");
      if (!looksLikeDbMutation(raw)) return;
      push(e.error ?? e.message);
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-100 px-4 py-3 text-sm shadow-lg backdrop-blur"
        >
          <div className="flex items-start gap-3">
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              aria-label="Schließen"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-rose-300 hover:text-white transition"
            >
              ✕
            </button>
          </div>
          {t.actionHref && (
            <Link
              href={t.actionHref}
              className="mt-2 inline-block text-xs font-semibold text-rose-200 underline hover:text-white"
            >
              {t.actionLabel ?? "Mehr erfahren"}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
