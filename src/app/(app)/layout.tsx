"use client";

import { Suspense, useMemo } from "react";
import { useCompany } from "@/lib/company-context";
import { useI18n } from "@/lib/i18n-context";
import { AppFooter } from "@/components/AppFooter";
import { PaymentOverdueBanner } from "@/components/PaymentOverdueBanner";
import { PasswordChangeGate } from "@/components/PasswordChangeGate";
import { ChatWidget } from "@/components/ChatWidget";
import OnboardingTour from "@/components/OnboardingTour";
import AppSidebar from "@/components/AppSidebar";
import type { TranslationKey } from "@/lib/translations/de";

const GREETING_POOL_SIZE: Record<"motivating" | "challenging" | "sarcastic", number> = {
  motivating: 25,
  challenging: 10,
  sarcastic: 10,
};

const GREETING_KEY_PREFIX: Record<"motivating" | "challenging" | "sarcastic", string> = {
  motivating: "greetings",
  challenging: "greetingsChallenging",
  sarcastic: "greetingsSarcastic",
};

/** Day index used for daily rotation — stable within a calendar day (local time). */
function dayOfEpoch(): number {
  const now = new Date();
  const utcMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(utcMs / 86_400_000);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { userName, greetingTone } = useCompany();
  const { t } = useI18n();
  const greeting = useMemo(() => {
    if (greetingTone === "off") return "";
    const size = GREETING_POOL_SIZE[greetingTone];
    const prefix = GREETING_KEY_PREFIX[greetingTone];
    const idx = dayOfEpoch() % size;
    return t(`${prefix}.${idx}` as TranslationKey, { name: "{name}" });
  }, [greetingTone, t]);

  return (
    <>
      <PasswordChangeGate />
      <PaymentOverdueBanner />
      {/* SCH-920 K2-K1 — AppSidebar uses useSearchParams() to keep the
          /time?view=… highlight in sync with the URL. Wrap in Suspense so
          static prerender can bail out gracefully on routes that don't have
          their own search-param boundary. */}
      <Suspense fallback={null}>
        <AppSidebar />
      </Suspense>
      <div className="lg:pl-60 flex flex-col min-h-screen">
        {userName && greeting && (
          <p className="hidden lg:block px-6 py-2 text-xs italic text-[var(--text-muted)] border-b border-[var(--border)]/50">
            {greeting.replace("{name}", userName)}
          </p>
        )}
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 w-full flex-1">
          {children}
        </main>
        <AppFooter />
      </div>
      <ChatWidget />
      <OnboardingTour />
    </>
  );
}
