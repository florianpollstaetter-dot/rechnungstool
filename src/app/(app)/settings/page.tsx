"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CompanySettings, CompanyType, COMPANY_TYPE_OPTIONS, SmartInsightsConfig, UserProfile } from "@/lib/types";
import { getSettings, updateSettings, getSmartInsightsConfig, upsertSmartInsightsConfig, getUserProfile, updateUserProfile } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/ThemeProvider";
import { useCompany } from "@/lib/company-context";
import AiCompanySetup from "@/components/AiCompanySetup";

const COMPANY_TYPE_WARNINGS: Record<CompanyType, string> = {
  gmbh: "GmbH: Soll-Besteuerung — die Umsatzsteuer wird fällig bei Rechnungsstellung, unabhaengig davon ob die Zahlung bereits eingegangen ist.",
  og: "OG: Ist-Besteuerung — die Umsatzsteuer wird erst fällig bei Zahlungseingang (sofern Jahresumsatz unter 2 Mio. EUR). Die USt-Berechnung im Dashboard aendert sich entsprechend.",
  verein: "Verein: Es gelten Sonderregelungen fuer die Umsatzsteuer. Bitte pruefen Sie die steuerlichen Auswirkungen mit Ihrem Steuerberater.",
};

const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

const THRESHOLD_EXPLANATIONS: Record<string, string> = {
  billable_rate_min: "Anteil der verrechenbaren Stunden an der Gesamtarbeitszeit. Liegt die Rate unter diesem Wert, wird eine Warnung angezeigt.",
  period_growth_threshold: "Maximaler Stundenanstieg im Vergleich zur Vorperiode. Wird dieser Prozentsatz ueberschritten, erscheint ein Hinweis.",
  top_project_share_max: "Maximaler Anteil eines einzelnen Projekts an der Gesamtzeit. Warnt vor zu starker Abhaengigkeit von einem Projekt.",
  budget_overshoot_warn_pct: "Ab diesem Prozentsatz der Budgetauslastung wird eine gelbe Warnung angezeigt.",
  budget_overshoot_critical_pct: "Ab diesem Prozentsatz der Budgetauslastung wird eine rote Critical-Warnung angezeigt.",
  overtime_threshold_pct: "Prozentsatz ueber der geplanten Arbeitszeit, ab dem Ueberstunden gemeldet werden.",
};

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
  const { userRole } = useCompany();
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

  // Smart Insights config (admin only)
  const [insightsConfig, setInsightsConfig] = useState<SmartInsightsConfig | null>(null);
  const [insightsSaving, setInsightsSaving] = useState(false);
  const [insightsSaved, setInsightsSaved] = useState(false);

  useEffect(() => {
    const cn = localStorage.getItem("show_chuck_norris");
    const tp = localStorage.getItem("show_tips");
    setShowChuckNorris(cn === "true");
    setShowTips(tp === null ? true : tp === "true");
  }, []);

  function toggleChuckNorris(val: boolean) {
    setShowChuckNorris(val);
    localStorage.setItem("show_chuck_norris", String(val));
  }

  function toggleTips(val: boolean) {
    setShowTips(val);
    localStorage.setItem("show_tips", String(val));
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

  function update(field: keyof CompanySettings, value: string | number) {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  }

  function handleCompanyTypeChange(newType: string) {
    if (!settings || newType === settings.company_type) return;
    setPendingTypeChange(newType as CompanyType);
  }

  function confirmTypeChange() {
    if (!pendingTypeChange) return;
    update("company_type", pendingTypeChange);
    setPendingTypeChange(null);
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
      setPasswordMessage({ type: "error", text: "Bitte altes Passwort eingeben." });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: "error", text: "Neues Passwort muss mindestens 6 Zeichen haben." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "Passwörter stimmen nicht überein." });
      return;
    }
    setPasswordSaving(true);
    try {
      const supabase = createClient();
      // Verify old password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Benutzer nicht gefunden.");
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPassword });
      if (signInError) {
        setPasswordMessage({ type: "error", text: "Altes Passwort ist falsch." });
        setPasswordSaving(false);
        return;
      }
      // Now change the password
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordMessage({ type: "success", text: "Passwort erfolgreich geändert." });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMessage({ type: "error", text: err instanceof Error ? err.message : "Passwort konnte nicht geändert werden." });
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

  if (loading || !settings) {
    return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;
  }

  const selectedType = COMPANY_TYPE_OPTIONS.find((o) => o.value === settings.company_type);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Einstellungen</h1>
      </div>

      {/* Per-user settings: Rufname */}
      <form onSubmit={handleRufnameSave} className="space-y-6 mb-6">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Rufname</h2>
              <p className="text-sm text-gray-500 mt-1">Dein persönlicher Anzeigename — wird individuell gespeichert.</p>
            </div>
            {rufnameSaved && <span className="text-sm text-emerald-400 font-medium">Gespeichert!</span>}
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <input type="text" value={rufname} onChange={(e) => setRufname(e.target.value)} className={inputClass} placeholder="Dein Rufname" />
            </div>
            <button type="submit" disabled={rufnameSaving} className="bg-[var(--accent)] text-black px-5 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition whitespace-nowrap">
              {rufnameSaving ? "Speichern..." : "Speichern"}
            </button>
          </div>
        </div>
      </form>

      <div className="space-y-6 mb-6">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Erscheinungsbild</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--text-secondary)]">Theme:</span>
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
                Dunkel
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
                Hell
              </button>
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Dashboard-Karten</h2>
          <p className="text-sm text-gray-500 mb-4">Zeige optionale Karten auf dem Dashboard an.</p>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-medium text-[var(--text-primary)]">Tipp des Tages</span>
                <p className="text-xs text-gray-500">Zeigt hilfreiche Tipps zu Features der Seite.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showTips}
                onClick={() => toggleTips(!showTips)}
                className={`relative w-11 h-6 rounded-full transition-colors ${showTips ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showTips ? "translate-x-5" : ""}`} />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-medium text-[var(--text-primary)]">Chuck Norris Fakt des Tages</span>
                <p className="text-xs text-gray-500">Zeigt einen zufälligen Chuck-Norris-Fakt pro Tag.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showChuckNorris}
                onClick={() => toggleChuckNorris(!showChuckNorris)}
                className={`relative w-11 h-6 rounded-full transition-colors ${showChuckNorris ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showChuckNorris ? "translate-x-5" : ""}`} />
              </button>
            </label>
          </div>
        </div>
      </div>

      {/* Per-user Begleittext — for non-admin invoice writers (e.g. accountant) */}
      {!canManageCompany && canWriteInvoices && (
        <form onSubmit={handleUserTextSave} className="space-y-6 mb-6">
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Begleittext (Rechnungen)</h2>
                <p className="text-sm text-gray-500 mt-1">Dein persoenlicher Begleittext — wird auf deinen Rechnungen angezeigt.</p>
              </div>
              {userTextSaved && <span className="text-sm text-emerald-400 font-medium">Gespeichert!</span>}
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Begleittext (Deutsch)</label>
                <textarea
                  value={userTextDe}
                  onChange={(e) => setUserTextDe(e.target.value)}
                  rows={2}
                  className={inputClass}
                  placeholder="z.B. Vielen Dank fuer Ihren Auftrag!"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Begleittext (English)</label>
                <textarea
                  value={userTextEn}
                  onChange={(e) => setUserTextEn(e.target.value)}
                  rows={2}
                  className={inputClass}
                  placeholder="e.g. Thank you for your order!"
                />
              </div>
            </div>
            <div className="mt-4">
              <button type="submit" disabled={userTextSaving} className="bg-[var(--accent)] text-black px-5 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
                {userTextSaving ? "Speichern..." : "Speichern"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Company settings form — only for roles that can manage company or write invoices */}
      {(canManageCompany || canWriteInvoices) && (
      <form onSubmit={handleSubmit} className="space-y-6">
        {canManageCompany && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Firmendaten</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Firmenname</label>
              <input type="text" value={settings.company_name} onChange={(e) => update("company_name", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">UID-Nummer</label>
              <input type="text" value={settings.uid} onChange={(e) => update("uid", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Adresse</label>
              <input type="text" value={settings.address} onChange={(e) => update("address", e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">PLZ</label>
                <input type="text" value={settings.zip} onChange={(e) => update("zip", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Stadt</label>
                <input type="text" value={settings.city} onChange={(e) => update("city", e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Telefon</label>
              <input type="text" value={settings.phone} onChange={(e) => update("phone", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">E-Mail</label>
              <input type="email" value={settings.email} onChange={(e) => update("email", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Website <span className="text-[var(--text-muted)] font-normal">(optional)</span></label>
              <input type="text" value={settings.website} onChange={(e) => update("website", e.target.value)} className={inputClass} placeholder="z.B. www.firma.at" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Branche <span className="text-[var(--text-muted)] font-normal">(optional)</span></label>
              <input type="text" value={settings.industry} onChange={(e) => update("industry", e.target.value)} className={inputClass} placeholder="z.B. Filmproduktion, IT, Gastronomie" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Beschreibung <span className="text-[var(--text-muted)] font-normal">(optional)</span></label>
              <input type="text" value={settings.description} onChange={(e) => update("description", e.target.value)} className={inputClass} placeholder="Was macht die Firma?" />
            </div>
          </div>
        </div>
        )}

        {canManageCompany && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Gesellschaftsform</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COMPANY_TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-colors ${
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
                <span className="font-semibold text-[var(--text-primary)]">{opt.label}</span>
                <span className="text-xs text-gray-500 mt-1">{opt.description}</span>
              </label>
            ))}
          </div>
          {selectedType && (
            <p className="text-sm text-[var(--text-secondary)] mt-3">
              Aktiv: <strong className="text-[var(--text-primary)]">{selectedType.label}</strong> — {selectedType.description}
            </p>
          )}
        </div>
        )}

        {canManageCompany && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Bankverbindung</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">IBAN</label>
              <input type="text" value={settings.iban} onChange={(e) => update("iban", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">BIC</label>
              <input type="text" value={settings.bic} onChange={(e) => update("bic", e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>
        )}

        {canWriteInvoices && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Zahlungsziel</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Standard-Zahlungsziel (Tage)</label>
              <input type="number" value={settings.default_payment_terms_days} onChange={(e) => update("default_payment_terms_days", Number(e.target.value))} min={1} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Standard-Steuersatz (%)</label>
              <input type="number" value={settings.default_tax_rate} onChange={(e) => update("default_tax_rate", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
          </div>
        </div>
        )}

        {canManageCompany && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Begleittext (Rechnungen)</h2>
          <p className="text-sm text-gray-500 mb-4">Firmenweiter Standard-Begleittext — wird auf Rechnungen angezeigt, sofern kein persoenlicher Text hinterlegt ist.</p>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Begleittext (Deutsch)</label>
              <textarea
                value={settings.accompanying_text_de}
                onChange={(e) => update("accompanying_text_de", e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="z.B. Vielen Dank fuer Ihren Auftrag!"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Begleittext (English)</label>
              <textarea
                value={settings.accompanying_text_en}
                onChange={(e) => update("accompanying_text_en", e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="e.g. Thank you for your order!"
              />
            </div>
          </div>
        </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
            {saving ? "Wird gespeichert..." : "Einstellungen speichern"}
          </button>
          {saved && <span className="text-sm text-emerald-400 font-medium self-center">Gespeichert!</span>}
        </div>
      </form>
      )}

      {/* AI Company Setup — admin only */}
      {isAdmin && <div className="mt-6"><AiCompanySetup companyName={settings.company_name} industry={settings.industry} website={settings.website} description={settings.description} /></div>}

      {/* Smart Insights Thresholds — admin only */}
      {isAdmin && insightsConfig && (
        <form onSubmit={handleInsightsSave} className="mt-6 bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Smart-Insights-Schwellwerte</h2>
              <p className="text-sm text-gray-500 mt-1">Schwellwerte fuer automatische Auswertungen und Warnungen.</p>
            </div>
            {insightsSaved && <span className="text-sm text-emerald-400 font-medium">Gespeichert!</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Mindest-Billable-Rate (%)
                <InfoTooltip text={THRESHOLD_EXPLANATIONS.billable_rate_min} />
              </label>
              <input type="number" value={Math.round(insightsConfig.billable_rate_min * 100)} onChange={(e) => updateInsights("billable_rate_min", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Stundenanstieg-Warnung (%)
                <InfoTooltip text={THRESHOLD_EXPLANATIONS.period_growth_threshold} />
              </label>
              <input type="number" value={Math.round(insightsConfig.period_growth_threshold * 100)} onChange={(e) => updateInsights("period_growth_threshold", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Projekt-Konzentrations-Warnung (%)
                <InfoTooltip text={THRESHOLD_EXPLANATIONS.top_project_share_max} />
              </label>
              <input type="number" value={Math.round(insightsConfig.top_project_share_max * 100)} onChange={(e) => updateInsights("top_project_share_max", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Budget-Warnung ab (%)
                <InfoTooltip text={THRESHOLD_EXPLANATIONS.budget_overshoot_warn_pct} />
              </label>
              <input type="number" value={Math.round(insightsConfig.budget_overshoot_warn_pct * 100)} onChange={(e) => updateInsights("budget_overshoot_warn_pct", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Budget-Critical ab (%)
                <InfoTooltip text={THRESHOLD_EXPLANATIONS.budget_overshoot_critical_pct} />
              </label>
              <input type="number" value={Math.round(insightsConfig.budget_overshoot_critical_pct * 100)} onChange={(e) => updateInsights("budget_overshoot_critical_pct", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Ueberstunden-Schwelle (%)
                <InfoTooltip text={THRESHOLD_EXPLANATIONS.overtime_threshold_pct} />
              </label>
              <input type="number" value={Math.round(insightsConfig.overtime_threshold_pct * 100)} onChange={(e) => updateInsights("overtime_threshold_pct", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
          </div>
          <div className="mt-4">
            <button type="submit" disabled={insightsSaving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
              {insightsSaving ? "Wird gespeichert..." : "Schwellwerte speichern"}
            </button>
          </div>
        </form>
      )}

      {/* Password Change — separate form, only affects current user */}
      <form onSubmit={handlePasswordChange} className="mt-6 bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Passwort ändern</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">Ändert das Passwort nur für den aktuell angemeldeten Benutzer.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Altes Passwort</label>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required className={inputClass} placeholder="Aktuelles Passwort" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Neues Passwort</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className={inputClass} placeholder="Mindestens 6 Zeichen" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Passwort bestätigen</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className={inputClass} placeholder="Passwort wiederholen" />
          </div>
        </div>
        {passwordMessage && (
          <p className={`text-sm mt-3 ${passwordMessage.type === "success" ? "text-emerald-400" : "text-rose-400"}`}>{passwordMessage.text}</p>
        )}
        <div className="mt-4">
          <button type="submit" disabled={passwordSaving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
            {passwordSaving ? "Wird geändert..." : "Passwort ändern"}
          </button>
        </div>
      </form>

      {pendingTypeChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPendingTypeChange(null)}>
          <div className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Gesellschaftsform aendern</h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              Sie wechseln von <strong className="text-[var(--text-primary)]">{COMPANY_TYPE_OPTIONS.find((o) => o.value === settings?.company_type)?.label}</strong> zu <strong className="text-[var(--text-primary)]">{COMPANY_TYPE_OPTIONS.find((o) => o.value === pendingTypeChange)?.label}</strong>.
            </p>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-300">{COMPANY_TYPE_WARNINGS[pendingTypeChange]}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setPendingTypeChange(null)} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition">
                Abbrechen
              </button>
              <button onClick={confirmTypeChange} className="px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition">
                Aendern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
