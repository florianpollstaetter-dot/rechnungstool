"use client";

// ORA-2758 — Consent-gated loader for Umami web analytics (Cookiebot pivot).
//
// Flow (strict, DSGVO/TKG-conform):
//   1. Nothing loads on mount. Umami is cookieless and stores no identifier,
//      but we still keep it fully dormant until the user opts in.
//   2. Only when the user has granted the "analytics" category do we inject the
//      Umami script (data-auto-track handles pageviews; custom events fire via
//      window.umami.track from lib/analytics.ts).
//   3. We re-evaluate live on the CONSENT_EVENT the banner dispatches, so a
//      user opting in mid-session starts tracking without a page reload.
//
// Reject-All never loads Umami at all → verifiable in DevTools (no script.js
// request, no /api/send beacon), which is the DSGVO gold standard.

import { useEffect } from "react";
import {
  CONSENT_EVENT,
  UMAMI_SCRIPT_URL,
  UMAMI_WEBSITE_ID,
  readCookieConsent,
  type CookieCategories,
} from "@/lib/analytics";

let umamiInjected = false;

function loadUmami(): void {
  if (!UMAMI_WEBSITE_ID || umamiInjected) return;
  const s = document.createElement("script");
  s.async = true;
  s.defer = true;
  s.src = UMAMI_SCRIPT_URL;
  s.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
  // Respect the browser Do-Not-Track signal in addition to our consent gate.
  s.setAttribute("data-do-not-track", "true");
  document.head.appendChild(s);
  umamiInjected = true;
}

function applyConsent(categories: CookieCategories): void {
  if (categories.analytics) loadUmami();
}

export default function AnalyticsLoader() {
  useEffect(() => {
    // No website id configured yet → keep everything dormant (safe no-op).
    if (!UMAMI_WEBSITE_ID) return;

    const stored = readCookieConsent();
    if (stored) applyConsent(stored.categories);

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<CookieCategories>).detail;
      if (detail) applyConsent(detail);
    };
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  return null;
}
