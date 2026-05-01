"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CompanySettings, CompanyType, COMPANY_TYPE_OPTIONS, isFirmenbuchRegistered, SmartInsightsConfig, UserProfile, GREETING_TONES, GreetingTone } from "@/lib/types";
import { getSettings, updateSettings, getSmartInsightsConfig, upsertSmartInsightsConfig, getUserProfile, updateUserProfile, uploadCompanyLogo, removeCompanyLogo } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/ThemeProvider";
import { useCompany } from "@/lib/company-context";
import { useI18n, SUPPORTED_LOCALES } from "@/lib/i18n-context";
import type { TranslationKey } from "@/lib/translations/de";
import AiCompanySetup from "@/components/AiCompanySetup";
import type { SuggestedCompanyData } from "@/components/AiCompanySetup";
import SubscriptionSection from "@/components/SubscriptionSection";
import OnboardingTour from "@/components/OnboardingTour";
import UserWorkScheduleSection from "@/components/UserWorkScheduleSection";
import GeneralCategoriesSection from "@/components/GeneralCategoriesSection";

const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

// THRESHOLD_EXPLANATIONS and COMPANY_TYPE_WARNINGS are now resolved via t() inside the component

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative inline-block ml-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors align-middle"
        aria-label="Info"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl p-3 text-xs text-[var(--text-secondary)] leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-[var(--border)]" />
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { userRole, greetingTone, setGreetingTone } = useCompany();
  const { t, locale, setLocale } = useI18n();
  const [replayTour, setReplayTour] = useState(false);
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager";
  const canManageCompany = isAdmin || isManager;
  const canWriteInvoices = isAdmin || isManager || userRole === "accountant";
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [rufname, setRufname] = useState("");
  const [rufnameSaving, setRufnameSaving] = useState(false);
  const [rufnameSaved, setRufnameSaved] = useState(false);
  const [userTextDe, setUserTextDe] = useState("");
  const [userTextEn, setUserTextEn] = useState("");
  const [userTextSaving, setUserTextSaving] = useState(false);
  const [userTextSaved, setUserTextSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingTypeChange, setPendingTypeChange] = useState<CompanyType | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Smart Insights config (admin only)
  // Dashboard card toggles (per-user, localStorage)
  const [showChuckNorris, setShowChuckNorris] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const [cardVisibility, setCardVisibility] = useState<Record<string, boolean>>({
    monatsumsatz: true,
    offene_rechnungen: true,
    ueberfaellig: true,
    umsatzsteuer: true,
    belege: true,
    fixkosten: true,
    smart_insights: true,
    letzte_rechnungen: true,
    letzte_angebote: true,
  });

  // Smart Insights config (admin only)
  const [insightsConfig, setInsightsConfig] = useState<SmartInsightsConfig | null>(null);
  const [insightsSaving, setInsightsSaving] = useState(false);
  const [insightsSaved, setInsightsSaved] = useState(false);

  // SCH-958 — Logo upload
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cn = localStorage.getItem("show_chuck_norris");
    const tp = localStorage.getItem("show_tips");
    setShowChuckNorris(cn === "true");
    setShowTips(tp === null ? true : tp === "true");

    const cardKeys = ["monatsumsatz", "offene_rechnungen", "ueberfaellig", "umsatzsteuer", "belege", "fixkosten", "smart_insights", "letzte_rechnungen", "letzte_angebote"];
    const vis: Record<string, boolean> = {};
    for (const key of cardKeys) {
      const stored = localStorage.getItem(`show_card_${key}`);
      vis[key] = stored === null ? true : stored === "true";
    }
    setCardVisibility(vis);
  }, []);

  function toggleChuckNorris(val: boolean) {
    setShowChuckNorris(val);
    localStorage.setItem("show_chuck_norris", String(val));
  }

  function toggleTips(val: boolean) {
    setShowTips(val);
    localStorage.setItem("show_tips", String(val));
  }

  function toggleCard(key: string, val: boolean) {
    setCardVisibility((prev) => ({ ...prev, [key]: val }));
    localStorage.setItem(`show_card_${key}`, String(val));
  }

  const loadData = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    if (isAdmin) {
      const ic = await getSmartInsightsConfig();
      setInsightsConfig(ic);
    }
    // Load current user profile for Rufname
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const profile = await getUserProfile(user.id);
      if (profile) {
        setUserProfile(profile);
        setRufname(profile.display_name || "");
        setUserTextDe(profile.accompanying_text_de || "");
        setUserTextEn(profile.accompanying_text_en || "");
      }
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const { id, ...rest } = settings;
      void id;
      await updateSettings(rest);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function update(field: keyof CompanySettings, value: string | number | boolean) {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  }

  function handleCompanyTypeChange(newType: string) {
    if (!settings || newType === settings.company_type) return;
    setPendingTypeChange(newType as CompanyType);
  }

  function confirmTypeChange() {
    if (!pendingTypeChange || !settings) return;
    setSettings({ ...settings, company_type: pendingTypeChange });
    setPendingTypeChange(null);
  }

  function handleKleinunternehmerToggle(enabled: boolean) {
    if (!settings) return;
    // SCH-519: Toggling Kleinunternehmerregelung recalculates the default tax rate.
    // Existing invoices keep their stored tax_rate; only the default for new ones flips.
    setSettings({
      ...settings,
      is_kleinunternehmer: enabled,
      default_tax_rate: enabled ? 0 : 20,
    });
  }

  async function handleGreetingToneChange(tone: GreetingTone) {
    setGreetingTone(tone);
    if (!userProfile) return;
    try {
      await updateUserProfile(userProfile.id, { greeting_tone: tone });
    } catch {
      // Tone is already applied client-side via context; surface nothing on save failure.
    }
  }

  async function handleRufnameSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userProfile) return;
    setRufnameSaving(true);
    try {
      await updateUserProfile(userProfile.id, { display_name: rufname });
      localStorage.setItem("currentUserName", rufname);
      setRufnameSaved(true);
      setTimeout(() => setRufnameSaved(false), 2000);
    } finally {
      setRufnameSaving(false);
    }
  }

  async function handleUserTextSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userProfile) return;
    setUserTextSaving(true);
    try {
      await updateUserProfile(userProfile.id, {
        accompanying_text_de: userTextDe,
        accompanying_text_en: userTextEn,
      });
      setUserTextSaved(true);
      setTimeout(() => setUserTextSaved(false), 2000);
    } finally {
      setUserTextSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);
    if (!oldPassword) {
      setPasswordMessage({ type: "error", text: t("settings.oldPasswordRequired") });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: "error", text: t("settings.passwordTooShort") });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: t("settings.passwordMismatch") });
      return;
    }
    setPasswordSaving(true);
    try {
      const supabase = createClient();
      // Verify old password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error(t("settings.userNotFound"));
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPassword });
      if (signInError) {
        setPasswordMessage({ type: "error", text: t("settings.oldPasswordWrong") });
        setPasswordSaving(false);
        return;
      }
      // Now change the password
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordMessage({ type: "success", text: t("settings.passwordChanged") });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMessage({ type: "error", text: err instanceof Error ? err.message : t("settings.passwordChangeFailed") });
    } finally {
      setPasswordSaving(false);
    }
  }

  function updateInsights(field: keyof SmartInsightsConfig, pct: number) {
    if (!insightsConfig) return;
    setInsightsConfig({ ...insightsConfig, [field]: Math.max(0, Math.min(100, pct)) / 100 });
  }

  async function handleInsightsSave(e: React.FormEvent) {
    e.preventDefault();
    if (!insightsConfig) return;
    setInsightsSaving(true);
    try {
      const { id, company_id, created_at, updated_at, ...rest } = insightsConfig;
      void id; void company_id; void created_at; void updated_at;
      await upsertSmartInsightsConfig(rest);
      setInsightsSaved(true);
      setTimeout(() => setInsightsSaved(false), 2000);
    } finally {
      setInsightsSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    setLogoError(null);
    if (!file.type.startsWith("image/")) {
      setLogoError(t("settings.logoNotAnImage"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError(t("settings.logoTooLarge"));
      return;
    }
    setLogoUploading(true);
    try {
      const url = await uploadCompanyLogo(file);
      setSettings((prev) => (prev ? { ...prev, logo_url: url } : prev));
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : t("settings.logoUploadFailed"));
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleLogoRemove() {
    setLogoError(null);
    setLogoUploading(true);
    try {
      await removeCompanyLogo();
      setSettings((prev) => (prev ? { ...prev, logo_url: "" } : prev));
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : t("settings.logoUploadFailed"));
    } finally {
      setLogoUploading(false);
    }
  }

  function handleAiCompanyDataFilled(data: Partial<SuggestedCompanyData>) {
    if (!settings) return;
    const updated = { ...settings };
    if (data.address) updated.address = data.address;
    if (data.zip) updated.zip = data.zip;
    if (data.city) updated.city = data.city;
    if (data.phone) updated.phone = data.phone;
    if (data.email) updated.email = data.email;
    if (data.uid) updated.uid = data.uid;
    if (data.website) updated.website = data.website;
    if (data.industry) updated.industry = data.industry;
    if (data.description) updated.description = data.description;
    setSettings(updated);
  }

  if (loading || !settings) {
    return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;
  }

  const selectedType = COMPANY_TYPE_OPTIONS.find((o) => o.value === settings.company_type);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("settings.title")}</h1>
      </div>

      {/* SCH-569: Abonnement — admin only */}
      <SubscriptionSection />

      {/* 1. Dashboard Karten */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("settings.dashboardCards")}</h2>
        <p className="text-sm text-gray-500 mb-4">{t("settings.dashboardCardsHint")}</p>
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("settings.cardGroupKpi")}</p>
          {([
            { key: "monatsumsatz", labelKey: "settings.cardMonthlyRevenue" as TranslationKey, descKey: "settings.cardMonthlyRevenueDesc" as TranslationKey, color: "text-emerald-400", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg> },
            { key: "offene_rechnungen", labelKey: "settings.cardOpenInvoices" as TranslationKey, descKey: "settings.cardOpenInvoicesDesc" as TranslationKey, color: "text-amber-400", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
            { key: "ueberfaellig", labelKey: "settings.cardOverdue" as TranslationKey, descKey: "settings.cardOverdueDesc" as TranslationKey, color: "text-rose-400", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg> },
            { key: "umsatzsteuer", labelKey: "settings.cardVat" as TranslationKey, descKey: "settings.cardVatDesc" as TranslationKey, color: "text-orange-400", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="m9 12 2 2 4-4" /></svg> },
            { key: "belege", labelKey: "settings.cardReceipts" as TranslationKey, descKey: "settings.cardReceiptsDesc" as TranslationKey, color: "text-violet-400", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M14 8H8" /><path d="M16 12H8" /><path d="M13 16H8" /></svg> },
            { key: "fixkosten", labelKey: "settings.cardFixedCosts" as TranslationKey, descKey: "settings.cardFixedCostsDesc" as TranslationKey, color: "text-cyan-400", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg> },
          ] as const).map((item) => (
            <label key={item.key} className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <span className={`${item.color} flex-shrink-0`}>{item.icon}</span>
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">{t(item.labelKey)}</span>
                  <p className="text-xs text-gray-500">{t(item.descKey)}</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={cardVisibility[item.key]}
                onClick={() => toggleCard(item.key, !cardVisibility[item.key])}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${cardVisibility[item.key] ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cardVisibility[item.key] ? "translate-x-5" : ""}`} />
              </button>
            </label>
          ))}

          <div className="border-t border-[var(--border)] pt-3 mt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("settings.cardGroupAreas")}</p>
          </div>
          {([
            { key: "smart_insights", labelKey: "settings.cardSmartInsights" as TranslationKey, descKey: "settings.cardSmartInsightsDesc" as TranslationKey, color: "text-blue-400", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /></svg> },
            { key: "letzte_rechnungen", labelKey: "settings.cardRecentInvoices" as TranslationKey, descKey: "settings.cardRecentInvoicesDesc" as TranslationKey, color: "text-gray-400", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 13H8" /><path d="M16 17H8" /><path d="M16 13h-2" /></svg> },
            { key: "letzte_angebote", labelKey: "settings.cardRecentQuotes" as TranslationKey, descKey: "settings.cardRecentQuotesDesc" as TranslationKey, color: "text-gray-400", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M8 13h2" /><path d="M14 13h2" /><path d="M8 17h8" /></svg> },
          ] as const).map((item) => (
            <label key={item.key} className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <span className={`${item.color} flex-shrink-0`}>{item.icon}</span>
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">{t(item.labelKey)}</span>
                  <p className="text-xs text-gray-500">{t(item.descKey)}</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={cardVisibility[item.key]}
                onClick={() => toggleCard(item.key, !cardVisibility[item.key])}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${cardVisibility[item.key] ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cardVisibility[item.key] ? "translate-x-5" : ""}`} />
              </button>
            </label>
          ))}

          <div className="border-t border-[var(--border)] pt-3 mt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("settings.cardGroupExtras")}</p>
          </div>
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="text-cyan-400 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
              </span>
              <div>
                <span className="text-sm font-medium text-[var(--text-primary)]">{t("settings.cardTipOfTheDay")}</span>
                <p className="text-xs text-gray-500">{t("settings.cardTipOfTheDayDesc")}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showTips}
              onClick={() => toggleTips(!showTips)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${showTips ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showTips ? "translate-x-5" : ""}`} />
            </button>
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="text-orange-400 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2"/><path d="M8 8h8"/><path d="M9 11c0 0 1 1 3 1s3-1 3-1"/></svg>
              </span>
              <div>
                <span className="text-sm font-medium text-[var(--text-primary)]">{t("settings.cardChuckNorris")}</span>
                <p className="text-xs text-gray-500">{t("settings.cardChuckNorrisDesc")}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showChuckNorris}
              onClick={() => toggleChuckNorris(!showChuckNorris)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${showChuckNorris ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showChuckNorris ? "translate-x-5" : ""}`} />
            </button>
          </label>
        </div>
      </div>

      {/* 2. Rufname */}
      <form onSubmit={handleRufnameSave} className="space-y-6 mb-6">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("settings.displayName")}</h2>
              <p className="text-sm text-gray-500 mt-1">{t("settings.displayNameHint")}</p>
            </div>
            {rufnameSaved && <span className="text-sm text-emerald-400 font-medium">{t("common.saved")}</span>}
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <input type="text" value={rufname} onChange={(e) => setRufname(e.target.value)} className={inputClass} placeholder={t("settings.displayNamePlaceholder")} />
            </div>
            <button type="submit" disabled={rufnameSaving} className="bg-[var(--accent)] text-black px-5 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition whitespace-nowrap">
              {rufnameSaving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </form>

      {/* 3. Begrüßungston (SCH-518) */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{t("settings.greetingTone")}</h2>
        <p className="text-sm text-gray-500 mb-4">{t("settings.greetingToneHint")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {GREETING_TONES.map((tone) => (
            <button
              key={tone}
              type="button"
              onClick={() => handleGreetingToneChange(tone)}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                greetingTone === tone
                  ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-gray-500 hover:text-[var(--text-primary)]"
              }`}
            >
              {t(`settings.greetingTone${tone.charAt(0).toUpperCase()}${tone.slice(1)}` as TranslationKey)}
            </button>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={() => setReplayTour(true)}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 transition"
          >
            {t("settings.replayOnboardingTour")}
          </button>
        </div>
      </div>
      {replayTour && <OnboardingTour forceOpen onClose={() => setReplayTour(false)} />}

      {/* 4. Passwort */}
      <form onSubmit={handlePasswordChange} className="mb-6 bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("settings.changePassword")}</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">{t("settings.changePasswordHint")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.oldPassword")}</label>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required className={inputClass} placeholder={t("settings.oldPasswordPlaceholder")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.newPassword")}</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className={inputClass} placeholder={t("settings.newPasswordPlaceholder")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.confirmPassword")}</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className={inputClass} placeholder={t("settings.confirmPasswordPlaceholder")} />
          </div>
        </div>
        {passwordMessage && (
          <p className={`text-sm mt-3 ${passwordMessage.type === "success" ? "text-emerald-400" : "text-rose-400"}`}>{passwordMessage.text}</p>
        )}
        <div className="mt-4">
          <button type="submit" disabled={passwordSaving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
            {passwordSaving ? t("settings.passwordSubmitting") : t("settings.passwordSubmit")}
          </button>
        </div>
      </form>

      {/* SCH-819 — Arbeitszeitmodell (per-user).
          SCH-918 K2-G9 — admin-only. RLS now also rejects non-admin writes
          (20260429143000_sch918_zeitmodell_admin_only.sql); MA see their
          schedule read-only inside /time/settings. */}
      {isAdmin && (
        <div className="mb-6">
          <UserWorkScheduleSection />
        </div>
      )}

      {/* SCH-921 K2-J1 — Admin-managed Allgemein/Sonstiges labels. */}
      {isAdmin && <GeneralCategoriesSection />}

      {/* SCH-958 K3-AA1 — Branding & Logo (admin/manager). Lives outside the
          main settings <form> so the upload/remove actions don't trigger the
          form's submit handler. */}
      {canManageCompany && (
        <div id="branding" className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6 scroll-mt-20">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{t("settings.branding")}</h2>
          <p className="text-sm text-gray-500 mb-4">{t("settings.brandingHint")}</p>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-32 h-32 flex-shrink-0 rounded-lg border border-[var(--border)] bg-[var(--background)] flex items-center justify-center overflow-hidden">
              {settings.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-xs text-[var(--text-muted)] text-center px-2">{t("settings.logoEmpty")}</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                }}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="px-3 py-2 text-sm rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition"
                >
                  {logoUploading
                    ? t("common.uploading")
                    : settings.logo_url
                      ? t("settings.changeLogo")
                      : t("settings.uploadLogo")}
                </button>
                {settings.logo_url && !logoUploading && (
                  <button
                    type="button"
                    onClick={handleLogoRemove}
                    className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--background)] transition"
                  >
                    {t("settings.removeLogo")}
                  </button>
                )}
              </div>
              {logoError && (
                <p className="text-sm text-red-500">{logoError}</p>
              )}
              <p className="text-xs text-[var(--text-muted)]">{t("settings.logoFormatHint")}</p>
            </div>
          </div>
        </div>
      )}

      {/* 4. Unternehmensdaten + company form (company type, bank, payment terms, accompanying text) */}
      {(canManageCompany || canWriteInvoices) && (
      <form onSubmit={handleSubmit} className="space-y-6 mb-6">
        {canManageCompany && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("settings.companyData")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.companyName")}</label>
              <input type="text" value={settings.company_name} onChange={(e) => update("company_name", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.uidNumber")}</label>
              <input type="text" value={settings.uid} onChange={(e) => update("uid", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("common.address")}</label>
              <input type="text" value={settings.address} onChange={(e) => update("address", e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("common.zip")}</label>
                <input type="text" value={settings.zip} onChange={(e) => update("zip", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("common.city")}</label>
                <input type="text" value={settings.city} onChange={(e) => update("city", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("common.country")}</label>
                <input
                  type="text"
                  value={settings.country}
                  onChange={(e) => update("country", e.target.value.toUpperCase().slice(0, 2))}
                  className={inputClass}
                  maxLength={2}
                  placeholder="AT"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("common.phone")}</label>
              <input type="text" value={settings.phone} onChange={(e) => update("phone", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("common.email")}</label>
              <input type="email" value={settings.email} onChange={(e) => update("email", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.website")} <span className="text-[var(--text-muted)] font-normal">({t("common.optional")})</span></label>
              <input type="text" value={settings.website} onChange={(e) => update("website", e.target.value)} className={inputClass} placeholder={t("settings.websitePlaceholder")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.industry")} <span className="text-[var(--text-muted)] font-normal">({t("common.optional")})</span></label>
              <input type="text" value={settings.industry} onChange={(e) => update("industry", e.target.value)} className={inputClass} placeholder={t("settings.industryPlaceholder")} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.companyDescription")} <span className="text-[var(--text-muted)] font-normal">({t("common.optional")})</span></label>
              <input type="text" value={settings.description} onChange={(e) => update("description", e.target.value)} className={inputClass} placeholder={t("settings.companyDescriptionPlaceholder")} />
            </div>
          </div>
        </div>
        )}

        {/* AI Company Setup — admin only, positioned right after Unternehmensdaten.
            id="ai-setup" supports the /settings#ai-setup deep link from QuoteNewSetupGate. */}
        {isAdmin && (
          <div id="ai-setup" className="scroll-mt-20">
            <AiCompanySetup
              companyName={settings.company_name}
              industry={settings.industry}
              website={settings.website}
              description={settings.description}
              onCompanyDataFilled={handleAiCompanyDataFilled}
            />
          </div>
        )}

        {canManageCompany && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("settings.bankDetails")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.iban")}</label>
              <input type="text" value={settings.iban} onChange={(e) => update("iban", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.bic")}</label>
              <input type="text" value={settings.bic} onChange={(e) => update("bic", e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>
        )}

        {canWriteInvoices && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("settings.paymentTerms")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.defaultPaymentDays")}</label>
              <input type="number" value={settings.default_payment_terms_days} onChange={(e) => update("default_payment_terms_days", Number(e.target.value))} min={1} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.defaultTaxRate")}</label>
              <input type="number" value={settings.default_tax_rate} onChange={(e) => update("default_tax_rate", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
          </div>
        </div>
        )}

        {canManageCompany && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("settings.accompanyingText")}</h2>
          <p className="text-sm text-gray-500 mb-4">{t("settings.accompanyingTextHintCompany")}</p>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.accompanyingTextDe")}</label>
              <textarea
                value={settings.accompanying_text_de}
                onChange={(e) => update("accompanying_text_de", e.target.value)}
                rows={2}
                className={inputClass}
                placeholder={t("settings.accompanyingTextPlaceholderDe")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.accompanyingTextEn")}</label>
              <textarea
                value={settings.accompanying_text_en}
                onChange={(e) => update("accompanying_text_en", e.target.value)}
                rows={2}
                className={inputClass}
                placeholder={t("settings.accompanyingTextPlaceholderEn")}
              />
            </div>
          </div>
        </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
            {saving ? t("settings.savingSettings") : t("settings.saveSettings")}
          </button>
          {saved && <span className="text-sm text-emerald-400 font-medium self-center">{t("common.saved")}</span>}
        </div>
      </form>
      )}

      {/* 5. The rest — Language, Appearance */}
      <div className="space-y-6 mb-6">
        {/* Language Switcher */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{t("settings.languageTitle")}</h2>
          <p className="text-sm text-gray-500 mb-4">{t("settings.languageHint")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc.code}
                type="button"
                onClick={() => setLocale(loc.code)}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                  locale === loc.code
                    ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-gray-500 hover:text-[var(--text-primary)]"
                }`}
              >
                <span className="text-lg">{loc.flag}</span>
                <span>{loc.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t("settings.appearance")}</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--text-secondary)]">{t("settings.theme")}</span>
            <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  theme === "dark"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t("settings.themeDark")}
              </button>
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  theme === "light"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t("settings.themeLight")}
              </button>
              <button
                type="button"
                onClick={() => setTheme("sand")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  theme === "sand"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t("settings.themeSand")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Per-user Begleittext — for non-admin invoice writers (e.g. accountant) */}
      {!canManageCompany && canWriteInvoices && (
        <form onSubmit={handleUserTextSave} className="space-y-6 mb-6">
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("settings.accompanyingText")}</h2>
                <p className="text-sm text-gray-500 mt-1">{t("settings.accompanyingTextHintUser")}</p>
              </div>
              {userTextSaved && <span className="text-sm text-emerald-400 font-medium">{t("common.saved")}</span>}
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.accompanyingTextDe")}</label>
                <textarea
                  value={userTextDe}
                  onChange={(e) => setUserTextDe(e.target.value)}
                  rows={2}
                  className={inputClass}
                  placeholder={t("settings.accompanyingTextPlaceholderDe")}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.accompanyingTextEn")}</label>
                <textarea
                  value={userTextEn}
                  onChange={(e) => setUserTextEn(e.target.value)}
                  rows={2}
                  className={inputClass}
                  placeholder={t("settings.accompanyingTextPlaceholderEn")}
                />
              </div>
            </div>
            <div className="mt-4">
              <button type="submit" disabled={userTextSaving} className="bg-[var(--accent)] text-black px-5 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
                {userTextSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Smart Insights Thresholds — admin only */}
      {isAdmin && insightsConfig && (
        <form onSubmit={handleInsightsSave} className="mb-6 bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("settings.smartInsightsThresholds")}</h2>
              <p className="text-sm text-gray-500 mt-1">{t("settings.smartInsightsThresholdsHint")}</p>
            </div>
            {insightsSaved && <span className="text-sm text-emerald-400 font-medium">{t("common.saved")}</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                {t("settings.minBillableRate")}
                <InfoTooltip text={t("settings.thresholdBillableRate")} />
              </label>
              <input type="number" value={Math.round(insightsConfig.billable_rate_min * 100)} onChange={(e) => updateInsights("billable_rate_min", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                {t("settings.hoursGrowthWarning")}
                <InfoTooltip text={t("settings.thresholdGrowth")} />
              </label>
              <input type="number" value={Math.round(insightsConfig.period_growth_threshold * 100)} onChange={(e) => updateInsights("period_growth_threshold", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                {t("settings.projectConcentrationWarning")}
                <InfoTooltip text={t("settings.thresholdProjectShare")} />
              </label>
              <input type="number" value={Math.round(insightsConfig.top_project_share_max * 100)} onChange={(e) => updateInsights("top_project_share_max", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                {t("settings.budgetWarning")}
                <InfoTooltip text={t("settings.thresholdBudgetWarn")} />
              </label>
              <input type="number" value={Math.round(insightsConfig.budget_overshoot_warn_pct * 100)} onChange={(e) => updateInsights("budget_overshoot_warn_pct", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                {t("settings.budgetCritical")}
                <InfoTooltip text={t("settings.thresholdBudgetCritical")} />
              </label>
              <input type="number" value={Math.round(insightsConfig.budget_overshoot_critical_pct * 100)} onChange={(e) => updateInsights("budget_overshoot_critical_pct", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                {t("settings.overtimeThreshold")}
                <InfoTooltip text={t("settings.thresholdOvertime")} />
              </label>
              <input type="number" value={Math.round(insightsConfig.overtime_threshold_pct * 100)} onChange={(e) => updateInsights("overtime_threshold_pct", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
          </div>
          <div className="mt-4">
            <button type="submit" disabled={insightsSaving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
              {insightsSaving ? t("settings.savingThresholds") : t("settings.saveThresholds")}
            </button>
          </div>
        </form>
      )}

      {/* SCH-519: Gesellschaftsform & Firmenbuch — positioned at the very bottom per board request. */}
      {canManageCompany && (
        <form onSubmit={handleSubmit} className="mb-6 bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("settings.legalFormSection")}</h2>
              <p className="text-sm text-gray-500 mt-1">{t("settings.legalFormSectionHint")}</p>
            </div>
            {saved && <span className="text-sm text-emerald-400 font-medium">{t("common.saved")}</span>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {COMPANY_TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex flex-col p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  settings.company_type === opt.value
                    ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                    : "border-[var(--border)] hover:border-gray-500"
                }`}
              >
                <input
                  type="radio"
                  name="company_type"
                  value={opt.value}
                  checked={settings.company_type === opt.value}
                  onChange={(e) => handleCompanyTypeChange(e.target.value)}
                  className="sr-only"
                />
                <span className="font-semibold text-[var(--text-primary)] text-sm">{t(`companyType.${opt.value}` as TranslationKey)}</span>
                <span className="text-xs text-gray-500 mt-1">{t(`companyType.${opt.value}Desc` as TranslationKey)}</span>
              </label>
            ))}
          </div>

          {selectedType && (
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t("settings.companyTypeActive")} <strong className="text-[var(--text-primary)]">{t(`companyType.${selectedType.value}` as TranslationKey)}</strong> — {t(`companyType.${selectedType.value}Desc` as TranslationKey)}
            </p>
          )}

          {isFirmenbuchRegistered(settings.company_type) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.firmenbuchnummer")}</label>
                <input type="text" value={settings.firmenbuchnummer} onChange={(e) => update("firmenbuchnummer", e.target.value)} className={inputClass} placeholder={t("settings.firmenbuchnummerPlaceholder")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.firmenbuchgericht")}</label>
                <input type="text" value={settings.firmenbuchgericht} onChange={(e) => update("firmenbuchgericht", e.target.value)} className={inputClass} placeholder={t("settings.firmenbuchgerichtPlaceholder")} />
              </div>
            </div>
          )}

          {settings.company_type === "gmbh_co_kg" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.firmenbuchnummerKomplementaer")}</label>
                <input type="text" value={settings.firmenbuchnummer_komplementaer} onChange={(e) => update("firmenbuchnummer_komplementaer", e.target.value)} className={inputClass} placeholder={t("settings.firmenbuchnummerPlaceholder")} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("settings.firmenbuchgerichtKomplementaer")}</label>
                <input type="text" value={settings.firmenbuchgericht_komplementaer} onChange={(e) => update("firmenbuchgericht_komplementaer", e.target.value)} className={inputClass} placeholder={t("settings.firmenbuchgerichtPlaceholder")} />
              </div>
            </div>
          )}

          <div className="border-t border-[var(--border)] pt-4 mb-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex-1 pr-4">
                <span className="text-sm font-medium text-[var(--text-primary)]">{t("settings.kleinunternehmer")}</span>
                <p className="text-xs text-gray-500 mt-1">{t("settings.kleinunternehmerHint")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.is_kleinunternehmer}
                onClick={() => handleKleinunternehmerToggle(!settings.is_kleinunternehmer)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${settings.is_kleinunternehmer ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.is_kleinunternehmer ? "translate-x-5" : ""}`} />
              </button>
            </label>
            {settings.is_kleinunternehmer && (
              <p className="text-xs text-emerald-400 mt-2">{t("settings.kleinunternehmerRecalcNotice")}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
              {saving ? t("settings.savingSettings") : t("settings.saveSettings")}
            </button>
          </div>
        </form>
      )}

      {pendingTypeChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPendingTypeChange(null)}>
          <div className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t("settings.changeCompanyType")}</h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              {t("settings.changeCompanyTypeFrom")} <strong className="text-[var(--text-primary)]">{t(`companyType.${settings?.company_type}` as TranslationKey)}</strong> {t("settings.changeCompanyTypeTo")} <strong className="text-[var(--text-primary)]">{t(`companyType.${pendingTypeChange}` as TranslationKey)}</strong>.
            </p>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-3">
              <p className="text-sm text-amber-300">{t(`companyTypeWarning.${pendingTypeChange}` as TranslationKey)}</p>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-rose-300">{t("companyTypeWarning.midYear")}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setPendingTypeChange(null)} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition">
                {t("common.cancel")}
              </button>
              <button onClick={confirmTypeChange} className="px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition">
                {t("settings.changeCompanyTypeConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
