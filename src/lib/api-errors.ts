// SCH-600 Phase-5 — safe error surfacing for API routes.
//
// Raw `err.message` from Postgres/Claude/Stripe can leak constraint names,
// table columns, full prompt echoes, and upstream URLs. Routes that return
// something user-visible should pipe errors through `safeErrorMessage` so
// the client sees a generic string and the full error only lands in server
// logs (via `logAndSanitize`).

/** Maximum length of a safe error message returned to the client. */
const SAFE_ERROR_MAX_LEN = 160;

/** Regex patterns whose matches should be stripped from error messages. */
const SCRUB_PATTERNS: RegExp[] = [
  // Postgres constraint names, e.g. "unique constraint 'companies_slug_key'"
  /constraint\s+["'`]?[\w]+["'`]?/gi,
  // Postgres column / table refs, e.g. "column \"foo\" of relation \"bar\""
  /(column|relation)\s+["'`]?[\w]+["'`]?/gi,
  // Absolute filesystem paths
  /\/(var|home|etc|usr|opt)\/[\w./-]+/g,
  // API keys (Anthropic / Stripe / Supabase common prefixes)
  /(sk-[a-zA-Z0-9_-]{16,}|pk_live_[a-zA-Z0-9]{16,}|sbp_[a-zA-Z0-9]{16,}|eyJ[a-zA-Z0-9_-]{20,})/g,
  // URLs (keep the host only would be nicer but this errs on safety)
  /https?:\/\/[^\s)]+/g,
];

export function safeErrorMessage(err: unknown, fallback = "Ein Fehler ist aufgetreten."): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;
  let scrubbed = raw;
  for (const pattern of SCRUB_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, "[redacted]");
  }
  if (scrubbed.length > SAFE_ERROR_MAX_LEN) {
    scrubbed = scrubbed.slice(0, SAFE_ERROR_MAX_LEN) + "…";
  }
  // If scrubbing left only redaction markers, fall back entirely.
  if (/^(\s|\[redacted\]|[,.:;—])*$/.test(scrubbed)) return fallback;
  return scrubbed;
}

/**
 * Log the full error server-side, return a safe message for the client.
 * Use at the boundary of route handlers, not inside pure functions.
 */
export function logAndSanitize(
  context: string,
  err: unknown,
  fallback = "Ein Fehler ist aufgetreten.",
): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  // Full detail goes to server logs only.
  console.error(`[${context}]`, raw);
  return safeErrorMessage(err, fallback);
}
