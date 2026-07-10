// ORA-2758 — Consent-gated analytics stack (GA4 + PostHog) for orange-octo.com.
// Plain module (no "use client") so it can be imported from both server and
// client components without the reference-proxy footgun (see AGENTS.md).
//
// The consent model reuses the existing self-hosted, branded cookie banner
// (CookieBanner.tsx) as the CMP — free, self-hosted, no vendor fee, which is
// exactly the goal of the Klaro/Cookiebot pivot. Categories map to services:
//   analytics -> GA4 + PostHog       marketing -> Meta Pixel (config only, off)
//
// Nothing loads until the user opts in, so no tracker fires before consent.

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

// Env-driven IDs. Left unset until Florian creates the free GA4 property and
// PostHog project (see ORA-2758). When unset, the loader is a safe no-op —
// nothing is injected, so the site ships without waiting on account creation.
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "";
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

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
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    posthog?: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- Conversion / product events -----------------------------------------
// Fire into whichever trackers the user consented to. Safe to call anytime:
// if a tracker isn't loaded (no consent / no ID), that arm is a no-op.

type EventParams = Record<string, string | number | boolean | undefined>;

export function track(event: string, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    window.gtag("event", event, params);
  }
  if (window.posthog && typeof window.posthog.capture === "function") {
    window.posthog.capture(event, params);
  }
}

// Named conversion events from the ORA-2758 scope.
export const trackTrialSignup = (params: EventParams = {}) => track("trial_signup", params);
export const trackPricingView = (params: EventParams = {}) => track("pricing_view", params);
export const trackLeadMagnetDownload = (params: EventParams = {}) =>
  track("lead_magnet_download", params);
export const trackSubscriptionPurchase = (params: EventParams = {}) =>
  track("subscription_purchase", params);
