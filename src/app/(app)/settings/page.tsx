"use client";

import { useState, useEffect, useCallback } from "react";
import { CompanySettings, CompanyType, COMPANY_TYPE_OPTIONS } from "@/lib/types";
import { getSettings, updateSettings } from "@/lib/db";

const COMPANY_TYPE_WARNINGS: Record<CompanyType, string> = {
  gmbh: "GmbH: Soll-Besteuerung — die Umsatzsteuer wird faellig bei Rechnungsstellung, unabhaengig davon ob die Zahlung bereits eingegangen ist.",
  og: "OG: Ist-Besteuerung — die Umsatzsteuer wird erst faellig bei Zahlungseingang (sofern Jahresumsatz unter 2 Mio. EUR). Die USt-Berechnung im Dashboard aendert sich entsprechend.",
  verein: "Verein: Es gelten Sonderregelungen fuer die Umsatzsteuer. Bitte pruefen Sie die steuerlichen Auswirkungen mit Ihrem Steuerberater.",
};

const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

export default function SettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingTypeChange, setPendingTypeChange] = useState<CompanyType | null>(null);

  const loadData = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    setLoading(false);
  }, []);

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

  if (loading || !settings) {
    return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;
  }

  const selectedType = COMPANY_TYPE_OPTIONS.find((o) => o.value === settings.company_type);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Einstellungen</h1>
        {saved && <span className="text-sm text-emerald-400 font-medium">Gespeichert!</span>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Gesellschaftsform</h2>
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
                <span className="font-semibold text-white">{opt.label}</span>
                <span className="text-xs text-gray-500 mt-1">{opt.description}</span>
              </label>
            ))}
          </div>
          {selectedType && (
            <p className="text-sm text-gray-400 mt-3">
              Aktiv: <strong className="text-white">{selectedType.label}</strong> — {selectedType.description}
            </p>
          )}
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Firmendaten</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Firmenname</label>
              <input type="text" value={settings.company_name} onChange={(e) => update("company_name", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">UID-Nummer</label>
              <input type="text" value={settings.uid} onChange={(e) => update("uid", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Adresse</label>
              <input type="text" value={settings.address} onChange={(e) => update("address", e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">PLZ</label>
                <input type="text" value={settings.zip} onChange={(e) => update("zip", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Stadt</label>
                <input type="text" value={settings.city} onChange={(e) => update("city", e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Telefon</label>
              <input type="text" value={settings.phone} onChange={(e) => update("phone", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">E-Mail</label>
              <input type="email" value={settings.email} onChange={(e) => update("email", e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Bankverbindung</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">IBAN</label>
              <input type="text" value={settings.iban} onChange={(e) => update("iban", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">BIC</label>
              <input type="text" value={settings.bic} onChange={(e) => update("bic", e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Standards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Standard-Zahlungsziel (Tage)</label>
              <input type="number" value={settings.default_payment_terms_days} onChange={(e) => update("default_payment_terms_days", Number(e.target.value))} min={1} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Standard-Steuersatz (%)</label>
              <input type="number" value={settings.default_tax_rate} onChange={(e) => update("default_tax_rate", Number(e.target.value))} min={0} max={100} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Begleittext (Rechnungen)</h2>
          <p className="text-sm text-gray-500 mb-4">Dieser Text wird auf jeder Rechnung und im PDF angezeigt. Pflegen Sie eine deutsche und eine englische Version.</p>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Begleittext (Deutsch)</label>
              <textarea
                value={settings.accompanying_text_de}
                onChange={(e) => update("accompanying_text_de", e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="z.B. Vielen Dank fuer Ihren Auftrag!"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Begleittext (English)</label>
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

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
            {saving ? "Wird gespeichert..." : "Einstellungen speichern"}
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
              <h3 className="text-lg font-semibold text-white">Gesellschaftsform aendern</h3>
            </div>
            <p className="text-sm text-gray-300 mb-2">
              Sie wechseln von <strong className="text-white">{COMPANY_TYPE_OPTIONS.find((o) => o.value === settings?.company_type)?.label}</strong> zu <strong className="text-white">{COMPANY_TYPE_OPTIONS.find((o) => o.value === pendingTypeChange)?.label}</strong>.
            </p>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-300">{COMPANY_TYPE_WARNINGS[pendingTypeChange]}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setPendingTypeChange(null)} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-[var(--surface-hover)] rounded-lg transition">
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
