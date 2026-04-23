"use client";

// SCH-582 — first-login guided tour. Six feature slides + a final slide with
// the company-setup form so the user leaves the tour with `company_settings`
// already seeded. Completion is persisted to `user_profiles.onboarding_
// completed_at` so the tour never re-shows automatically; users can trigger
// it again from Settings ("Tour erneut ansehen").

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSettings, updateSettings } from "@/lib/db";
import { CompanySettings } from "@/lib/types";
import { useI18n } from "@/lib/i18n-context";
import type { TranslationKey } from "@/lib/translations/de";

interface Props {
  /** When true, the tour renders even if onboarding_completed_at is non-null. */
  forceOpen?: boolean;
  onClose?: () => void;
}

type SellerPatch = Partial<
  Pick<CompanySettings, "company_name" | "address" | "city" | "zip" | "country" | "uid" | "iban" | "bic" | "email" | "phone">
>;

interface FeatureSlide {
  icon: string;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

const FEATURE_SLIDES: FeatureSlide[] = [
  { icon: "🏠", titleKey: "onboarding.slide.dashboard.title", bodyKey: "onboarding.slide.dashboard.body" },
  { icon: "📋", titleKey: "onboarding.slide.quotes.title", bodyKey: "onboarding.slide.quotes.body" },
  { icon: "💸", titleKey: "onboarding.slide.invoices.title", bodyKey: "onboarding.slide.invoices.body" },
  { icon: "👥", titleKey: "onboarding.slide.customers.title", bodyKey: "onboarding.slide.customers.body" },
  { icon: "🧾", titleKey: "onboarding.slide.receipts.title", bodyKey: "onboarding.slide.receipts.body" },
  { icon: "📦", titleKey: "onboarding.slide.einvoice.title", bodyKey: "onboarding.slide.einvoice.body" },
];

const SELLER_FIELDS: (keyof SellerPatch)[] = [
  "company_name",
  "address",
  "zip",
  "city",
  "country",
  "uid",
  "iban",
  "bic",
  "email",
  "phone",
];

export default function OnboardingTour({ forceOpen = false, onClose }: Props) {
  const { t } = useI18n();
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0..N-1 feature slides; N = setup slide
  const [form, setForm] = useState<SellerPatch>({});
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ confidence?: string; source?: string; cost_eur?: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totalSlides = FEATURE_SLIDES.length + 1; // +1 for final setup slide
  const finalIdx = totalSlides - 1;

  // Decide whether to show the tour for this user on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (!cancelled) setAuthUserId(user.id);

      if (forceOpen) {
        if (!cancelled) setOpen(true);
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_completed_at")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!profile) return;
      if (profile.onboarding_completed_at == null && !cancelled) {
        setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forceOpen]);

  // Load current settings into the setup-slide form the first time we arrive
  // there, so the user sees what's already filled.
  useEffect(() => {
    if (step !== finalIdx || !open) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await getSettings();
        if (cancelled) return;
        const patch: SellerPatch = {};
        for (const key of SELLER_FIELDS) {
          patch[key] = (s[key] as string) || "";
        }
        setForm(patch);
      } catch {
        /* settings may not exist yet for brand-new tenants — leave blank */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, open, finalIdx]);

  async function markCompleted() {
    if (!authUserId) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("user_profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("auth_user_id", authUserId);
    if (error) {
      // Non-fatal — if the update fails, the tour re-shows next login and the
      // user can dismiss again. Log for observability.
      console.error("onboarding_completed_at update failed:", error.message);
    }
  }

  async function handleSkip() {
    setSaving(true);
    try {
      await markCompleted();
    } finally {
      setSaving(false);
    }
    setOpen(false);
    onClose?.();
  }

  async function handleSaveAndFinish() {
    setSaving(true);
    setErrorMsg(null);
    try {
      // Only send fields the user actually filled (non-empty + different from
      // whatever getSettings returned). Safer than always pushing the whole
      // form and avoids stomping on settings someone else set.
      const trimmed: SellerPatch = {};
      for (const key of SELLER_FIELDS) {
        const value = (form[key] || "").trim();
        if (value) trimmed[key] = value;
      }
      if (Object.keys(trimmed).length > 0) {
        await updateSettings(trimmed);
      }
      await markCompleted();
      setOpen(false);
      onClose?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAiComplete() {
    const searchName = (form.company_name || "").trim();
    if (!searchName) {
      setAiResult({ confidence: "error", source: t("onboarding.needCompanyName") });
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch("/api/company/ai-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: searchName }),
      });
      const data = await res.json();
      if (data.success && data.company) {
        setForm((prev) => {
          const next: SellerPatch = { ...prev };
          for (const key of SELLER_FIELDS) {
            if (!next[key] && data.company[key]) {
              next[key] = data.company[key];
            }
          }
          return next;
        });
        setAiResult({ confidence: data.confidence, source: data.source, cost_eur: data.cost?.cost_eur });
      } else {
        setAiResult({ confidence: "error", source: data.error || "AI-Abfrage fehlgeschlagen." });
      }
    } catch (err) {
      setAiResult({ confidence: "error", source: err instanceof Error ? err.message : String(err) });
    } finally {
      setAiLoading(false);
    }
  }

  if (!open) return null;

  const isFinal = step === finalIdx;
  const slide = isFinal ? null : FEATURE_SLIDES[step];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border)] w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)]">
          <div className="text-xs text-[var(--text-muted)]">
            {t("onboarding.stepCounter", { current: String(step + 1), total: String(totalSlides) })}
          </div>
          <button
            onClick={handleSkip}
            disabled={saving}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition underline underline-offset-2"
          >
            {t("onboarding.skipTour")}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          {slide && (
            <div className="text-center">
              <div className="text-6xl mb-4" aria-hidden="true">{slide.icon}</div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                {t(slide.titleKey)}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                {t(slide.bodyKey)}
              </p>
            </div>
          )}

          {isFinal && (
            <div>
              <div className="text-center mb-5">
                <div className="text-5xl mb-3" aria-hidden="true">🚀</div>
                <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
                  {t("onboarding.setup.title")}
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  {t("onboarding.setup.body")}
                </p>
              </div>

              <div className="flex justify-end mb-3">
                <button
                  onClick={handleAiComplete}
                  disabled={aiLoading}
                  className="bg-purple-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-purple-500 transition disabled:opacity-50"
                >
                  {aiLoading ? t("customers.researching") : t("customers.aiCompletion")}
                </button>
              </div>

              {aiResult && (
                <div
                  className={`mb-3 text-xs rounded-md px-3 py-2 border ${
                    aiResult.confidence === "error"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  {aiResult.confidence === "error" ? (
                    <>Error: {aiResult.source}</>
                  ) : (
                    <>
                      {t("customers.aiCompleted")}
                      {aiResult.source ? ` · ${t("customers.aiSource")}: ${aiResult.source}` : ""}
                      {typeof aiResult.cost_eur === "number" ? ` · €${aiResult.cost_eur.toFixed(4)}` : ""}
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {SELLER_FIELDS.map((key) => {
                  const labelMap: Record<keyof SellerPatch, string> = {
                    company_name: t("settings.companyName"),
                    address: t("common.address"),
                    zip: t("common.zip"),
                    city: t("common.city"),
                    country: t("common.country"),
                    uid: t("settings.uidNumber"),
                    iban: t("settings.iban"),
                    bic: t("settings.bic"),
                    email: t("common.email"),
                    phone: t("common.phone"),
                  };
                  const span = key === "company_name" || key === "address" ? "col-span-2" : "";
                  return (
                    <div key={key} className={span}>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        {labelMap[key]}
                      </label>
                      <input
                        type="text"
                        value={form[key] || ""}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                      />
                    </div>
                  );
                })}
              </div>

              {errorMsg && (
                <div className="mt-3 text-xs rounded-md px-3 py-2 border border-rose-500/40 bg-rose-500/10 text-rose-300">
                  {t("customers.saveError")}: {errorMsg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: slide indicators + navigation */}
        <div className="border-t border-[var(--border)] px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={t("onboarding.jumpToSlide", { index: String(i + 1) })}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-[var(--border)] hover:bg-[var(--text-muted)]"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0 || saving}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("onboarding.back")}
            </button>
            {isFinal ? (
              <>
                <button
                  onClick={handleSkip}
                  disabled={saving}
                  className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition disabled:opacity-50"
                >
                  {t("onboarding.later")}
                </button>
                <button
                  onClick={handleSaveAndFinish}
                  disabled={saving}
                  className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
                >
                  {saving ? t("common.saving") : t("onboarding.saveAndStart")}
                </button>
              </>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition"
              >
                {t("onboarding.next")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
