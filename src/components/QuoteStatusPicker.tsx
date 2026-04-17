"use client";

import { useState, useRef, useEffect } from "react";
import { QuoteStatus } from "@/lib/types";
import { useI18n } from "@/lib/i18n-context";

const STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];

const statusStyles: Record<QuoteStatus, { pill: string; chip: string; dot: string }> = {
  draft:    { pill: "bg-gray-500/20 text-gray-300 ring-1 ring-gray-500/40",      chip: "text-gray-300 hover:bg-gray-500/20",    dot: "bg-gray-400" },
  sent:     { pill: "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40",      chip: "text-blue-300 hover:bg-blue-500/20",    dot: "bg-blue-400" },
  accepted: { pill: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40", chip: "text-emerald-300 hover:bg-emerald-500/20", dot: "bg-emerald-400" },
  rejected: { pill: "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40",      chip: "text-rose-300 hover:bg-rose-500/20",    dot: "bg-rose-400" },
  expired:  { pill: "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40",   chip: "text-amber-300 hover:bg-amber-500/20",  dot: "bg-amber-400" },
};

interface Props {
  status: QuoteStatus;
  onChange: (next: QuoteStatus) => void | Promise<void>;
  size?: "sm" | "md";
  align?: "left" | "right";
}

export default function QuoteStatusPicker({ status, onChange, size = "md", align = "left" }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const padding = size === "sm" ? "px-2 py-0.5" : "px-3 py-1";
  const textSize = size === "sm" ? "text-[11px]" : "text-xs";
  const alignClass = align === "right" ? "right-0" : "left-0";

  async function pick(s: QuoteStatus) {
    setOpen(false);
    if (s === status) return;
    setBusy(true);
    try {
      await onChange(s);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((v) => !v); }}
        disabled={busy}
        title={t("quoteStatus.changeStatus")}
        className={`${textSize} font-medium ${padding} rounded-full inline-flex items-center gap-1.5 transition hover:brightness-125 disabled:opacity-60 cursor-pointer ${statusStyles[status].pill}`}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusStyles[status].dot}`} />
        <span>{t(`quoteStatus.${status}`)}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className={`absolute z-50 mt-1 ${alignClass} w-48 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl p-1`}>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] px-2 pt-1 pb-1">{t("quoteStatus.changeStatus")}</div>
          {STATUSES.map((s) => {
            const isActive = s === status;
            return (
              <button
                key={s}
                type="button"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); pick(s); }}
                className={`w-full text-left text-xs font-medium px-2 py-1.5 rounded-md flex items-center gap-2 transition ${statusStyles[s].chip} ${isActive ? "cursor-default opacity-60" : "cursor-pointer"}`}
                disabled={isActive}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${statusStyles[s].dot}`} />
                <span className="flex-1">{t(`quoteStatus.${s}`)}</span>
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
