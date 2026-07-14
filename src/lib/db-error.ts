// ORA-2809 C1: mutating Supabase calls throw technical English errors that
// callers often don't catch, so a failed "Speichern" silently does nothing
// while the real error lands as an unhandled console exception.
//
// humanizeDbError() turns any thrown value into a single, user-facing German
// sentence. It is the shared translation layer for both inline error state and
// the GlobalErrorToaster, so every failed mutation shows the same clear text.

export interface HumanizedError {
  message: string;
  /** Optional in-app link the UI can render as a call-to-action. */
  actionHref?: string;
  actionLabel?: string;
}

function rawText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message ?? "");
  }
  return String(err);
}

export function humanizeDbErrorDetailed(err: unknown): HumanizedError {
  const raw = rawText(err);
  const lc = raw.toLowerCase();

  // Billing read-only gate (Postgres P0001 from enforce_company_not_readonly).
  if (lc.includes("ueberfaellig") || lc.includes("überfällig") || lc.includes("funktionen eingeschr")) {
    return {
      message:
        "Diese Aktion ist derzeit gesperrt, weil für dein Konto eine offene Rechnung vorliegt. Bitte begleiche die ausstehende Zahlung, um wieder speichern zu können.",
      actionHref: "/settings?tab=billing",
      actionLabel: "Zur Abrechnung",
    };
  }

  // Stale schema / missing column (PostgREST schema-cache miss).
  if (lc.includes("could not find") && lc.includes("column")) {
    return {
      message:
        "Speichern fehlgeschlagen: Die Datenbank ist gerade nicht auf dem aktuellen Stand. Bitte lade die Seite neu und versuche es erneut.",
    };
  }

  // RLS / permission denial.
  if (lc.includes("row-level security") || lc.includes("permission denied") || lc.includes("not authorized")) {
    return { message: "Keine Berechtigung für diese Aktion." };
  }

  // Uniqueness violation.
  if (lc.includes("duplicate key") || lc.includes("unique constraint")) {
    return { message: "Ein Eintrag mit diesen Daten existiert bereits." };
  }

  // Network / offline.
  if (lc.includes("failed to fetch") || lc.includes("networkerror") || lc.includes("network request failed") || lc.includes("load failed")) {
    return { message: "Netzwerkfehler — bitte prüfe deine Internetverbindung und versuche es erneut." };
  }

  return {
    message: "Speichern fehlgeschlagen. Bitte versuche es erneut." + (raw ? ` (${raw})` : ""),
  };
}

export function humanizeDbError(err: unknown): string {
  return humanizeDbErrorDetailed(err).message;
}
