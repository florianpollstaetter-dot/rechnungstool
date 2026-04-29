"use client";

// SCH-929 K2-λ P2.3 — DB-persisted draft autosave for the Angebot editor.
// Every `intervalMs`, if `enabled` is true, the latest payload is upserted
// against the existing draft id (or a fresh draft is created and its id is
// reported back via `onSaved` so the next tick switches to update mode).
// The hook intentionally stays narrow: it does not enforce throttling on
// rapid keystrokes — debouncing happens at the timer boundary.

import { useEffect, useRef } from "react";
import { Quote } from "@/lib/types";
import { createQuote, updateQuote } from "@/lib/db";

type DraftPayload = Omit<Quote, "id" | "created_at" | "quote_number">;

interface Options {
  draftId: string | null;
  enabled: boolean;
  buildPayload: () => DraftPayload;
  onSaved: (id: string) => void;
  intervalMs?: number;
}

export function useDraftQuoteAutosave({
  draftId,
  enabled,
  buildPayload,
  onSaved,
  intervalMs = 60_000,
}: Options) {
  const idRef = useRef(draftId);
  const enabledRef = useRef(enabled);
  const buildRef = useRef(buildPayload);
  const onSavedRef = useRef(onSaved);
  const inFlightRef = useRef(false);

  // Keep the refs current without re-binding the interval.
  idRef.current = draftId;
  enabledRef.current = enabled;
  buildRef.current = buildPayload;
  onSavedRef.current = onSaved;

  useEffect(() => {
    const timer = setInterval(async () => {
      if (!enabledRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const payload = buildRef.current();
        if (idRef.current) {
          await updateQuote(idRef.current, payload);
        } else {
          const created = await createQuote(payload);
          idRef.current = created.id;
          onSavedRef.current(created.id);
        }
      } catch (err) {
        // Autosave failures shouldn't break the editor — surface to console
        // so the user can still hit Submit explicitly. The toast on Submit
        // will report the same error if it persists.
        console.error("[draft-autosave] failed", err);
      } finally {
        inFlightRef.current = false;
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
}
