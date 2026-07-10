"use client";

// ORA-2758 — Consent-gated loader for GA4 + PostHog with Google Consent Mode v2.
//
// Flow (strict, DSGVO/TKG-conform):
//   1. On mount we install the gtag stub and set Consent Mode v2 defaults to
//      "denied" for every storage type — before any tag is injected.
//   2. Only when the user has granted the "analytics" category do we inject the
//      GA4 gtag.js script + PostHog, then push a consent "update" to "granted".
//   3. "marketing" consent flips ad_* signals to granted (Meta Pixel itself
//      stays disabled per scope — config only until Meta-Ads go live).
//   4. We re-evaluate live on the CONSENT_EVENT the banner dispatches, so a
//      user opting in mid-session starts tracking without a page reload.
//
// Reject-All never loads GA4/PostHog at all → verifiable in DevTools (no
// gtag/js or PostHog network request), which is stronger than cookieless pings.

import { useEffect } from "react";
import {
  CONSENT_EVENT,
  GA_MEASUREMENT_ID,
  POSTHOG_HOST,
  POSTHOG_KEY,
  readCookieConsent,
  type CookieCategories,
} from "@/lib/analytics";

/* eslint-disable @typescript-eslint/no-explicit-any */

let gaScriptInjected = false;
let posthogInjected = false;
let consentDefaultsSet = false;

function ensureGtag(): (...args: any[]) => void {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
  return window.gtag;
}

function setConsentDefaults(): void {
  if (consentDefaultsSet) return;
  const gtag = ensureGtag();
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    wait_for_update: 500,
  });
  gtag("set", "url_passthrough", true);
  consentDefaultsSet = true;
}

function loadGa4(): void {
  if (!GA_MEASUREMENT_ID) return;
  const gtag = ensureGtag();
  gtag("consent", "update", {
    analytics_storage: "granted",
  });
  if (gaScriptInjected) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, { anonymize_ip: true });
  gaScriptInjected = true;
}

function loadPosthog(): void {
  if (!POSTHOG_KEY || posthogInjected) return;

  // Minimal array-stub: queue calls until array.js loads, then init flushes.
  const stub: any = window.posthog || [];
  window.posthog = stub;
  const methods = [
    "init",
    "capture",
    "identify",
    "register",
    "register_once",
    "reset",
    "group",
    "setPersonProperties",
    "people",
  ];
  for (const m of methods) {
    if (typeof stub[m] !== "function") {
      stub[m] = function () {
        // eslint-disable-next-line prefer-rest-params
        stub.push([m].concat(Array.prototype.slice.call(arguments, 0)));
      };
    }
  }
  stub.__SV = 1;

  const scr = document.createElement("script");
  scr.async = true;
  scr.src = `${POSTHOG_HOST}/static/array.js`;
  document.head.appendChild(scr);

  window.posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: true,
    autocapture: true,
  });
  posthogInjected = true;
}

function applyConsent(categories: CookieCategories): void {
  setConsentDefaults();
  const gtag = ensureGtag();
  if (categories.analytics) {
    loadGa4();
    loadPosthog();
  }
  if (categories.marketing) {
    gtag("consent", "update", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
  }
}

export default function AnalyticsLoader() {
  useEffect(() => {
    // No IDs configured yet → keep everything dormant (safe no-op).
    if (!GA_MEASUREMENT_ID && !POSTHOG_KEY) return;

    setConsentDefaults();

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
/* eslint-enable @typescript-eslint/no-explicit-any */
