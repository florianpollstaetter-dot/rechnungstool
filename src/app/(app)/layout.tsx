"use client";

import { Suspense } from "react";
import { AppFooter } from "@/components/AppFooter";
import { PaymentOverdueBanner } from "@/components/PaymentOverdueBanner";
import { PasswordChangeGate } from "@/components/PasswordChangeGate";
import { ChatWidget } from "@/components/ChatWidget";
import OnboardingTour from "@/components/OnboardingTour";
import AppSidebar from "@/components/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PasswordChangeGate />
      <PaymentOverdueBanner />
      {/* SCH-920 K2-K1 — AppSidebar uses useSearchParams() to keep the
          /time?view=… highlight in sync with the URL. Wrap in Suspense so
          static prerender can bail out gracefully on routes that don't have
          their own search-param boundary.
          SCH-915 K2-C1 — the daily greeting moved into AppSidebar (under the
          orangeocto logo); the previous banner above <main> is gone. */}
      <Suspense fallback={null}>
        <AppSidebar />
      </Suspense>
      <div className="lg:pl-60 flex flex-col min-h-screen">
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
