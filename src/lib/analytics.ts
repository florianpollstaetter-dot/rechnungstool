// ORA-2758 — Consent-gated analytics for orange-octo.com. Umami pivot.
//
// After 74 days of silence on the Florian-owned Google/PostHog account
// creation, the stack was pivoted to Umami (MIT-licensed, cookieless,
// EU-hosted) — no vendor account owned by a third party is required, so the
// site can ship analytics without an external unblock. Plain module (no
// "use client") so it can be imported from both server and client components
// without the reference-proxy footgun (see AGENTS.md).
//
// The consent model reuses the existing self-hosted, branded cookie banner
// (CookieBanner.tsx) as the CMP — free, self-hosted, no vendor fee. Umami is
// cookieless and does not store any identifier, but we still gate it behind the
// "analytics" category so nothing loads before the user opts in (strictest
// DSGVO/TKG reading; Reject-All ≡ no analytics script at all).

export const CONSENT_STORAGE_KEY = "octo-cookie-consent-v1";
export const CONSENT_EVENT = "octo-consent-changed";

export type CookieCategories = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
};

export interface StoredConsent {
  categories: CookieCategories;
  timestamp: string;
  version: 1;
}

// Env-driven config. Left unset until the Umami website is provisioned (Umami
// Cloud EU free tier or agent-hosted instance). When unset, the loader is a
// safe no-op — nothing is injected, so the site ships without waiting on setup.
export const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? "";
export const UMAMI_SCRIPT_URL =
  process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL ?? "https://eu.umami.is/script.js";

export function readCookieConsent(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version === 1 && parsed.categories) return parsed as StoredConsent;
  } catch {
    /* malformed JSON or localStorage blocked */
  }
  return null;
}

export function writeCookieConsent(categories: CookieCategories): void {
  const consent: StoredConsent = {
    categories,
    timestamp: new Date().toISOString(),
    version: 1,
  };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
  } catch {
    /* localStorage may be unavailable in private mode */
  }
  // Broadcast so AnalyticsLoader can load/unload trackers live, without reload.
  try {
    window.dispatchEvent(new CustomEvent<CookieCategories>(CONSENT_EVENT, { detail: categories }));
  } catch {
    /* CustomEvent unsupported */
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    umami?: {
      track: (
        eventOrProps?: string | ((props: any) => any),
        data?: Record<string, unknown>,
      ) => void;
      identify?: (data: Record<string, unknown>) => void;
    };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- Conversion / product events -----------------------------------------
// Fire into Umami if it consented + loaded. Safe to call anytime: if Umami
// isn't loaded (no consent / no website id), this is a no-op.

type EventParams = Record<string, string | number | boolean | undefined>;

export function track(event: string, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  if (window.umami && typeof window.umami.track === "function") {
    window.umami.track(event, params);
  }
}

// Named conversion events from the ORA-2758 scope.
export const trackTrialSignup = (params: EventParams = {}) => track("trial_signup", params);
export const trackPricingView = (params: EventParams = {}) => track("pricing_view", params);
export const trackLeadMagnetDownload = (params: EventParams = {}) =>
  track("lead_magnet_download", params);
export const trackSubscriptionPurchase = (params: EventParams = {}) =>
  track("subscription_purchase", params);
