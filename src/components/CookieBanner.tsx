"use client";

// SCH-819 Phase 3 — DSGVO/EU cookie consent banner with Octo branding.
// Persists choice in localStorage; categories are essential (always on),
// analytics, marketing. Reading helper exposed for any future analytics
// gating (Plausible/PostHog/etc.) to check before firing.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/lib/i18n-context";

const STORAGE_KEY = "octo-cookie-consent-v1";

export type CookieCategories = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
};

interface StoredConsent {
  categories: CookieCategories;
  timestamp: string;
  version: 1;
}

export function readCookieConsent(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version === 1 && parsed.categories) return parsed as StoredConsent;
  } catch {
    /* malformed JSON or localStorage blocked */
  }
  return null;
}

export default function CookieBanner() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!readCookieConsent()) setOpen(true);
  }, []);

  const save = useCallback((categories: CookieCategories) => {
    const consent: StoredConsent = {
      categories,
      timestamp: new Date().toISOString(),
      version: 1,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch {
      /* localStorage may be unavailable in private mode */
    }
    setOpen(false);
    setShowSettings(false);
  }, []);

  if (!open) return null;

  const acceptAll = () => save({ essential: true, analytics: true, marketing: true });
  const rejectAll = () => save({ essential: true, analytics: false, marketing: false });
  const saveCustom = () => save({ essential: true, analytics, marketing });

  return (
    <>
      {/* Banner — bottom-right card. Hidden visually when settings dialog open on mobile. */}
      <div
        role="dialog"
        aria-label={t("cookie.bannerTitle")}
        className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[110] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-5 ${
          showSettings ? "hidden sm:block" : ""
        }`}
      >
        <div className="flex items-start gap-3 mb-3">
          <Image
            src="/brand/octo-icon-orange.png"
            alt=""
            width={40}
            height={40}
            className="shrink-0 select-none"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">
              {t("cookie.bannerTitle")}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {t("cookie.bannerBody")}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mb-3">
          <Link href="/datenschutz" className="underline hover:text-[var(--brand-orange)]">
            {t("cookie.privacyLink")}
          </Link>
          <span aria-hidden="true"> · </span>
          <Link href="/impressum" className="underline hover:text-[var(--brand-orange)]">
            {t("cookie.imprintLink")}
          </Link>
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={acceptAll}
            className="bg-[var(--brand-orange)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
          >
            {t("cookie.acceptAll")}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={rejectAll}
              className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-xs font-medium hover:text-[var(--text-primary)] transition"
            >
              {t("cookie.rejectAll")}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-xs font-medium hover:text-[var(--text-primary)] transition"
            >
              {t("cookie.customize")}
            </button>
          </div>
        </div>
      </div>

      {/* Settings dialog — overlay + centered modal */}
      {showSettings && (
        <>
          <div
            className="fixed inset-0 z-[115] bg-black/60"
            onClick={() => setShowSettings(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label={t("cookie.settingsTitle")}
            aria-modal="true"
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 z-[120] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-6"
          >
            <div className="flex items-start gap-3 mb-4">
              <Image
                src="/brand/octo-icon-orange.png"
                alt=""
                width={40}
                height={40}
                className="shrink-0 select-none"
              />
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  {t("cookie.settingsTitle")}
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {t("cookie.settingsBody")}
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]/40 cursor-not-allowed">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="mt-0.5 accent-[var(--brand-orange)]"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t("cookie.catEssential")}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {t("cookie.catEssentialDesc")}
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--surface-hover)] transition">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="mt-0.5 accent-[var(--brand-orange)]"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t("cookie.catAnalytics")}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {t("cookie.catAnalyticsDesc")}
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--surface-hover)] transition">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="mt-0.5 accent-[var(--brand-orange)]"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t("cookie.catMarketing")}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {t("cookie.catMarketingDesc")}
                  </p>
                </div>
              </label>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:text-[var(--text-primary)] transition"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={saveCustom}
                className="bg-[var(--brand-orange)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
              >
                {t("cookie.save")}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
