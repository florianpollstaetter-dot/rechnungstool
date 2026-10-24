// ORA-3310 — pure, dependency-free authorization policy.
//
// Kept free of Next / Supabase imports on purpose so the security rules can be
// unit-tested with plain `tsx` (tests/unit/ora3310-api-access-policy.test.ts)
// without spinning up a server or mocking the request pipeline. The proxy and
// the per-route guard both consume these helpers so there is a single source
// of truth for "what is public" and "who may touch a company".

// The ONLY API paths reachable without a Supabase session. Each still enforces
// its own gate inside the handler (Stripe signature / CRON_SECRET bearer /
// pre-login signup). Keep minimal — everything else fails closed.
export const PUBLIC_API_PATHS = [
  "/api/register-company", // signup — no session exists yet
  "/api/stripe/webhook", // Stripe → verified via the stripe-signature header
  "/api/treasury/ebics/poll", // Vercel-Cron → verified via CRON_SECRET bearer
  "/api/cron/magazin-freischaltung", // KIN-6649 — Vercel-Cron → verified via CRON_SECRET bearer
  "/api/at/uid-pruefen", // KIN-6527 — public VIES UID check for /at/ guides; no tenant data, rate-limited per IP
];

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type MembershipDecision =
  | { ok: false; status: 401 | 403; error: string }
  | { ok: true };

/**
 * Decide whether a caller may act on `requestedCompanyId`.
 *   - not authenticated            → 401
 *   - authenticated but not a member of the company (or no company given) → 403
 *   - member                       → ok
 */
export function decideCompanyMembership(
  isAuthenticated: boolean,
  memberCompanyIds: string[],
  requestedCompanyId: string | null | undefined,
): MembershipDecision {
  if (!isAuthenticated) {
    return { ok: false, status: 401, error: "Nicht authentifiziert" };
  }
  if (!requestedCompanyId || !memberCompanyIds.includes(requestedCompanyId)) {
    return { ok: false, status: 403, error: "Kein Zugriff auf diese Firma" };
  }
  return { ok: true };
}
