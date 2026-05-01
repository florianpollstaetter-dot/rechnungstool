"use client";

// SCH-386 / SCH-406 — AI-Unternehmens-Setup: Vorschläge laden und bei Unternehmensanlage anwenden.
// SCH-406 additions:
// 1. Protect pre-filled fields from AI overwrite
// 2. Mark optional fields
// 3. Web research for company + industry info
// 4. Editable roles list (double-click to edit, save button)
// 5. Manual role addition
// 6. Cost display next to heading after AI run

import { useState, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { createCompanyRole, createProduct, getCompanyRoles } from "@/lib/db";
import { UnitType, unitDisplayLabel } from "@/lib/types";
import { useCompany } from "@/lib/company-context";
import MissingFieldsPopup, { MissingFieldSpec } from "./MissingFieldsPopup";

const MISSING_FIELD_SPECS: Record<string, Omit<MissingFieldSpec, "key">> = {
  address: { label: "Adresse", placeholder: "Straße + Hausnummer" },
  zip: { label: "PLZ" },
  city: { label: "Stadt" },
  phone: { label: "Telefon", placeholder: "+43 1 234 5678" },
  email: { label: "E-Mail", placeholder: "info@firma.at" },
  uid: { label: "UID-Nummer", placeholder: "z.B. ATU12345678", hint: "EU-Mehrwertsteuer-Identifikationsnummer" },
  website: { label: "Website", placeholder: "https://www.firma.at" },
  industry: { label: "Branche" },
  description: { label: "Beschreibung" },
};

interface SuggestedRole {
  name: string;
  description: string;
  color: string;
  typical_hourly_rate: number | null;
}

interface SuggestedDepartment {
  name: string;
  description: string;
}

interface SuggestedProduct {
  name: string;
  unit: "Stunden" | "Tage" | "Pauschale" | "Stueck";
  unit_price: number;
  tax_rate: number;
  role_name: string | null;
}

export interface SuggestedCompanyData {
  address: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  uid: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
}

interface Suggestions {
  detected_industry: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  suggested_company_data?: SuggestedCompanyData;
  suggested_roles: SuggestedRole[];
  suggested_departments: SuggestedDepartment[];
  suggested_products: SuggestedProduct[];
  suggested_expense_categories: string[];
  suggested_payment_terms_days: number;
  suggested_default_tax_rate: number;
  onboarding_tips: string[];
}

interface ApiResponse {
  success: boolean;
  suggestions: Suggestions;
  cost: { input_tokens: number; output_tokens: number; cost_eur: number };
  // SCH-960 — multi-pass response fields.
  passes?: number;
  missingCompanyFields?: string[];
}

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-rose-400",
};

const ROLE_COLOR_PRESETS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#78716c",
];

interface AiCompanySetupProps {
  companyName: string;
  industry?: string;
  website?: string;
  description?: string;
  onCompanyDataFilled?: (data: Partial<SuggestedCompanyData>) => void;
}

export default function AiCompanySetup({ companyName, industry: initialIndustry, website: initialWebsite, description: initialDescription, onCompanyDataFilled }: AiCompanySetupProps) {
  const { company } = useCompany();

  // Form fields — pre-filled from company settings
  const [name] = useState(companyName);
  const [industry, setIndustry] = useState(initialIndustry || "");
  const [website, setWebsite] = useState(initialWebsite || "");
  const [description, setDescription] = useState(initialDescription || "");

  // Track which fields were pre-filled from company settings (read-only in AI form)
  const hasPrefilledIndustry = !!initialIndustry;
  const hasPrefilledWebsite = !!initialWebsite;
  const hasPrefilledDescription = !!initialDescription;

  // Track which fields were pre-filled before AI run
  const preFilledRef = useRef<{ industry: string; website: string; description: string } | null>(null);

  // State
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [costEur, setCostEur] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);

  // Checkbox selections
  const [selectedRoles, setSelectedRoles] = useState<Set<number>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());

  // Editable roles state: index → edited fields
  const [editingRoleIdx, setEditingRoleIdx] = useState<number | null>(null);
  const [editedRole, setEditedRole] = useState<SuggestedRole | null>(null);

  // Company data field selections
  const [selectedCompanyFields, setSelectedCompanyFields] = useState<Set<string>>(new Set());

  // Manual role addition
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRole, setNewRole] = useState<SuggestedRole>({
    name: "",
    description: "",
    color: ROLE_COLOR_PRESETS[0],
    typical_hourly_rate: null,
  });

  // SCH-960 — fallback popup for company-data fields the AI couldn't find.
  const [missingCompanyFields, setMissingCompanyFields] = useState<string[]>([]);
  const [showMissingPopup, setShowMissingPopup] = useState(false);
  const [aiPasses, setAiPasses] = useState<number | null>(null);
  const [manualCompanyData, setManualCompanyData] = useState<Partial<SuggestedCompanyData>>({});

  async function handleFetch() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    setSuggestions(null);
    setApplied(false);

    // Snapshot pre-filled values before the AI run
    preFilledRef.current = {
      industry: industry.trim(),
      website: website.trim(),
      description: description.trim(),
    };

    try {
      const res = await fetch("/api/company/setup-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          companyName: name.trim(),
          industry: industry.trim() || undefined,
          website: website.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });

      const data: ApiResponse & { error?: string } = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `Fehler ${res.status}`);
      }

      setSuggestions(data.suggestions);
      setCostEur(data.cost.cost_eur);
      setAiPasses(data.passes ?? null);

      // Select all by default
      setSelectedRoles(new Set(data.suggestions.suggested_roles.map((_, i) => i)));
      setSelectedProducts(new Set(data.suggestions.suggested_products.map((_, i) => i)));

      // Auto-select company data fields that have non-null values
      if (data.suggestions.suggested_company_data) {
        const cd = data.suggestions.suggested_company_data;
        const fields = new Set<string>();
        for (const [key, val] of Object.entries(cd)) {
          if (val) fields.add(key);
        }
        setSelectedCompanyFields(fields);
      }

      // SCH-960: open the fallback popup if the API reports any required
      // company-data field still empty after all passes.
      if (Array.isArray(data.missingCompanyFields) && data.missingCompanyFields.length > 0) {
        setMissingCompanyFields(data.missingCompanyFields);
        setShowMissingPopup(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  function toggleRole(idx: number) {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function toggleProduct(idx: number) {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function toggleAllRoles() {
    if (!suggestions) return;
    if (selectedRoles.size === suggestions.suggested_roles.length) {
      setSelectedRoles(new Set());
    } else {
      setSelectedRoles(new Set(suggestions.suggested_roles.map((_, i) => i)));
    }
  }

  function toggleAllProducts() {
    if (!suggestions) return;
    if (selectedProducts.size === suggestions.suggested_products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(suggestions.suggested_products.map((_, i) => i)));
    }
  }

  function startEditRole(idx: number) {
    if (!suggestions) return;
    setEditingRoleIdx(idx);
    setEditedRole({ ...suggestions.suggested_roles[idx] });
  }

  function saveEditedRole() {
    if (!suggestions || editingRoleIdx === null || !editedRole) return;
    const updated = [...suggestions.suggested_roles];
    updated[editingRoleIdx] = editedRole;
    setSuggestions({ ...suggestions, suggested_roles: updated });
    setEditingRoleIdx(null);
    setEditedRole(null);
  }

  function cancelEditRole() {
    setEditingRoleIdx(null);
    setEditedRole(null);
  }

  function addManualRole() {
    if (!suggestions || !newRole.name.trim()) return;
    const updated = [...suggestions.suggested_roles, { ...newRole, name: newRole.name.trim(), description: newRole.description.trim() }];
    setSuggestions({ ...suggestions, suggested_roles: updated });
    // Auto-select the new role
    setSelectedRoles((prev) => new Set([...prev, updated.length - 1]));
    setNewRole({ name: "", description: "", color: ROLE_COLOR_PRESETS[0], typical_hourly_rate: null });
    setShowAddRole(false);
  }

  async function handleApply() {
    if (!suggestions) return;
    setApplying(true);
    setError(null);

    try {
      // SCH-525: make sure the JWT's app_metadata.company_id is current before
      // we hit the RLS-protected INSERTs. CompanyProvider syncs on mount but
      // this guards against stale sessions (e.g. tab open across a company
      // switch) so "Übernehmen" doesn't fail with an RLS violation.
      try {
        const supabase = createClient();
        await supabase.rpc("set_active_company", { p_company_id: company.id });
        await supabase.auth.refreshSession();
      } catch {
        // RPC may not exist in older environments — fall through and let RLS
        // surface the real error if the session is genuinely bad.
      }

      // 1. Create selected roles first (we need their IDs for product role_id mapping)
      const roleNameToId: Record<string, string> = {};

      // Get existing roles to avoid duplicates
      const existingRoles = await getCompanyRoles();
      const existingRoleNames = new Set(existingRoles.map((r) => r.name.toLowerCase()));

      for (const idx of selectedRoles) {
        const role = suggestions.suggested_roles[idx];
        if (existingRoleNames.has(role.name.toLowerCase())) {
          const existing = existingRoles.find(
            (r) => r.name.toLowerCase() === role.name.toLowerCase()
          );
          if (existing) roleNameToId[role.name] = existing.id;
          continue;
        }
        const created = await createCompanyRole({
          name: role.name,
          description: role.description,
          color: role.color,
        });
        roleNameToId[role.name] = created.id;
      }

      // 2. Create selected products
      for (const idx of selectedProducts) {
        const product = suggestions.suggested_products[idx];
        const roleId = product.role_name ? roleNameToId[product.role_name] || null : null;

        await createProduct({
          name: product.name,
          description: "",
          name_en: "",
          description_en: "",
          unit: product.unit as UnitType,
          unit_price: product.unit_price,
          tax_rate: product.tax_rate,
          active: true,
          role_id: roleId,
        });
      }

      // 3. Apply selected company data fields. SCH-960: merge in any
      // manually-entered values from the fallback popup so the parent gets a
      // single complete payload.
      if (onCompanyDataFilled) {
        const data: Partial<SuggestedCompanyData> = {};
        if (suggestions.suggested_company_data && selectedCompanyFields.size > 0) {
          const cd = suggestions.suggested_company_data;
          for (const key of selectedCompanyFields) {
            const val = cd[key as keyof SuggestedCompanyData];
            if (val) (data as Record<string, string>)[key] = val;
          }
        }
        for (const [key, val] of Object.entries(manualCompanyData)) {
          if (val) (data as Record<string, string>)[key] = val;
        }
        if (Object.keys(data).length > 0) onCompanyDataFilled(data);
      }

      setApplied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Anwenden");
    } finally {
      setApplying(false);
    }
  }

  const totalSelected = selectedRoles.size + selectedProducts.size + selectedCompanyFields.size;

  const COMPANY_DATA_LABELS: Record<string, string> = {
    address: "Adresse",
    zip: "PLZ",
    city: "Stadt",
    phone: "Telefon",
    email: "E-Mail",
    uid: "UID-Nummer",
    website: "Website",
    industry: "Branche",
    description: "Beschreibung",
  };

  function toggleCompanyField(key: string) {
    setSelectedCompanyFields((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">AI-Unternehmens-Setup</h2>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
          Beta
        </span>
        {costEur != null && suggestions && !applied && (
          <span className="text-xs text-[var(--text-muted)] ml-auto">
            {aiPasses != null && aiPasses > 1 ? `${aiPasses} Pässe · ` : ""}Kosten: {costEur.toFixed(4)} EUR
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Branchenspezifische Rollen, Produkte und Konfiguration per AI-Analyse vorschlagen lassen.
      </p>

      {/* Input form */}
      {!suggestions && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Unternehmensname *
              </label>
              <input
                type="text"
                value={name}
                readOnly
                className={`${inputClass} opacity-70 cursor-not-allowed`}
                title="Unternehmensname wird aus den Einstellungen übernommen"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Branche <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                {hasPrefilledIndustry && <span className="text-[var(--text-muted)] font-normal ml-1" title="Aus Einstellungen übernommen">— gespeichert</span>}
              </label>
              <input
                type="text"
                value={industry}
                onChange={hasPrefilledIndustry ? undefined : (e) => setIndustry(e.target.value)}
                readOnly={hasPrefilledIndustry}
                className={`${inputClass}${hasPrefilledIndustry ? " opacity-70 cursor-not-allowed" : ""}`}
                placeholder="z.B. Filmproduktion, IT, Gastronomie"
                title={hasPrefilledIndustry ? "Wird aus den Einstellungen übernommen — dort änderbar" : undefined}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Website <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                {hasPrefilledWebsite && <span className="text-[var(--text-muted)] font-normal ml-1" title="Aus Einstellungen übernommen">— gespeichert</span>}
              </label>
              <input
                type="text"
                value={website}
                onChange={hasPrefilledWebsite ? undefined : (e) => setWebsite(e.target.value)}
                readOnly={hasPrefilledWebsite}
                className={`${inputClass}${hasPrefilledWebsite ? " opacity-70 cursor-not-allowed" : ""}`}
                placeholder="z.B. www.unternehmen.at"
                title={hasPrefilledWebsite ? "Wird aus den Einstellungen übernommen — dort änderbar" : undefined}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Beschreibung <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                {hasPrefilledDescription && <span className="text-[var(--text-muted)] font-normal ml-1" title="Aus Einstellungen übernommen">— gespeichert</span>}
              </label>
              <input
                type="text"
                value={description}
                onChange={hasPrefilledDescription ? undefined : (e) => setDescription(e.target.value)}
                readOnly={hasPrefilledDescription}
                className={`${inputClass}${hasPrefilledDescription ? " opacity-70 cursor-not-allowed" : ""}`}
                placeholder="Was macht das Unternehmen?"
                title={hasPrefilledDescription ? "Wird aus den Einstellungen übernommen — dort änderbar" : undefined}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleFetch}
            disabled={loading || !name.trim()}
            className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" className="opacity-75" />
                </svg>
                AI analysiert &amp; recherchiert...
              </>
            ) : (
              "AI-Vorschläge laden"
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      )}

      {/* Suggestions display */}
      {suggestions && !applied && (
        <div className="space-y-5 mt-2">
          {/* Industry detection */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-[var(--text-secondary)]">Erkannte Branche:</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {suggestions.detected_industry}
            </span>
            <span
              className={`text-xs font-medium ${CONFIDENCE_COLORS[suggestions.confidence] || "text-gray-400"}`}
            >
              ({suggestions.confidence})
            </span>
          </div>
          {suggestions.reasoning && (
            <p className="text-xs text-[var(--text-muted)] -mt-3">{suggestions.reasoning}</p>
          )}

          {/* Suggested company data */}
          {suggestions.suggested_company_data && (() => {
            const cd = suggestions.suggested_company_data!;
            const availableFields = Object.entries(cd).filter(([, val]) => val);
            if (availableFields.length === 0) return null;
            return (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Unternehmensdaten ({selectedCompanyFields.size}/{availableFields.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedCompanyFields.size === availableFields.length) {
                        setSelectedCompanyFields(new Set());
                      } else {
                        setSelectedCompanyFields(new Set(availableFields.map(([k]) => k)));
                      }
                    }}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {selectedCompanyFields.size === availableFields.length ? "Keine auswählen" : "Alle auswählen"}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableFields.map(([key, val]) => (
                    <label
                      key={key}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedCompanyFields.has(key)
                          ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                          : "border-[var(--border)] hover:border-gray-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCompanyFields.has(key)}
                        onChange={() => toggleCompanyField(key)}
                        className="mt-0.5 accent-[var(--accent)]"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-[var(--text-muted)]">{COMPANY_DATA_LABELS[key] || key}</span>
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{val}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">Ausgewählte Felder werden in die Unternehmensdaten übernommen</p>
              </div>
            );
          })()}

          {/* Roles — editable */}
          {suggestions.suggested_roles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Rollen ({selectedRoles.size}/{suggestions.suggested_roles.length})
                </h3>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddRole(true)}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    + Rolle hinzufügen
                  </button>
                  <button
                    type="button"
                    onClick={toggleAllRoles}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {selectedRoles.size === suggestions.suggested_roles.length
                      ? "Keine auswählen"
                      : "Alle auswählen"}
                  </button>
                </div>
              </div>

              {/* Manual role addition form */}
              {showAddRole && (
                <div className="mb-3 p-3 rounded-lg border border-dashed border-[var(--accent)] bg-[var(--accent-dim)]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <input
                      type="text"
                      value={newRole.name}
                      onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                      className={inputClass}
                      placeholder="Rollenname *"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={newRole.description}
                      onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                      className={inputClass}
                      placeholder="Beschreibung"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">Farbe:</span>
                      <div className="flex gap-1">
                        {ROLE_COLOR_PRESETS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setNewRole({ ...newRole, color: c })}
                            className={`w-5 h-5 rounded-full border-2 transition ${newRole.color === c ? "border-white scale-110" : "border-transparent"}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      value={newRole.typical_hourly_rate ?? ""}
                      onChange={(e) => setNewRole({ ...newRole, typical_hourly_rate: e.target.value ? Number(e.target.value) : null })}
                      className={inputClass}
                      placeholder="Stundensatz EUR (optional)"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addManualRole}
                      disabled={!newRole.name.trim()}
                      className="bg-[var(--accent)] text-black px-4 py-1.5 rounded-lg text-xs font-semibold hover:brightness-110 disabled:opacity-50 transition"
                    >
                      Hinzufügen
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddRole(false)}
                      className="px-4 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestions.suggested_roles.map((role, i) => (
                  <div key={i}>
                    {editingRoleIdx === i && editedRole ? (
                      /* Inline edit form */
                      <div className="p-3 rounded-lg border border-[var(--accent)] bg-[var(--accent-dim)] space-y-2">
                        <input
                          type="text"
                          value={editedRole.name}
                          onChange={(e) => setEditedRole({ ...editedRole, name: e.target.value })}
                          className={inputClass}
                          placeholder="Rollenname"
                          autoFocus
                        />
                        <input
                          type="text"
                          value={editedRole.description}
                          onChange={(e) => setEditedRole({ ...editedRole, description: e.target.value })}
                          className={inputClass}
                          placeholder="Beschreibung"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--text-muted)]">Farbe:</span>
                          <div className="flex gap-1">
                            {ROLE_COLOR_PRESETS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setEditedRole({ ...editedRole, color: c })}
                                className={`w-4 h-4 rounded-full border-2 transition ${editedRole.color === c ? "border-white scale-110" : "border-transparent"}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                        <input
                          type="number"
                          value={editedRole.typical_hourly_rate ?? ""}
                          onChange={(e) => setEditedRole({ ...editedRole, typical_hourly_rate: e.target.value ? Number(e.target.value) : null })}
                          className={inputClass}
                          placeholder="Stundensatz EUR"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={cancelEditRole}
                            className="px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition"
                          >
                            Abbrechen
                          </button>
                          <button
                            type="button"
                            onClick={saveEditedRole}
                            disabled={!editedRole.name.trim()}
                            className="bg-[var(--accent)] text-black px-3 py-1 rounded text-xs font-semibold hover:brightness-110 disabled:opacity-50 transition"
                          >
                            Speichern
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Normal role card */
                      <label
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedRoles.has(i)
                            ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                            : "border-[var(--border)] hover:border-gray-500"
                        }`}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          startEditRole(i);
                        }}
                        title="Doppelklick zum Bearbeiten"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRoles.has(i)}
                          onChange={() => toggleRole(i)}
                          className="mt-0.5 accent-[var(--accent)]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: role.color }}
                            />
                            <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                              {role.name}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">{role.description}</p>
                          {role.typical_hourly_rate != null && (
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                              ~{role.typical_hourly_rate} EUR/h
                            </p>
                          )}
                        </div>
                      </label>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">Doppelklick auf eine Rolle zum Bearbeiten</p>
            </div>
          )}

          {/* Products */}
          {suggestions.suggested_products.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Produkte / Leistungen ({selectedProducts.size}/
                  {suggestions.suggested_products.length})
                </h3>
                <button
                  type="button"
                  onClick={toggleAllProducts}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  {selectedProducts.size === suggestions.suggested_products.length
                    ? "Keine auswählen"
                    : "Alle auswählen"}
                </button>
              </div>
              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--surface-hover)] text-[var(--text-secondary)] text-xs">
                      <th className="px-3 py-2 text-left w-8" />
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Einheit</th>
                      <th className="px-3 py-2 text-right">Preis</th>
                      <th className="px-3 py-2 text-left">Rolle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.suggested_products.map((product, i) => (
                      <tr
                        key={i}
                        onClick={() => toggleProduct(i)}
                        className={`border-t border-[var(--border)] cursor-pointer transition-colors ${
                          selectedProducts.has(i)
                            ? "bg-[var(--accent-dim)]"
                            : "hover:bg-[var(--surface-hover)]"
                        }`}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(i)}
                            onChange={() => toggleProduct(i)}
                            className="accent-[var(--accent)]"
                          />
                        </td>
                        <td className="px-3 py-2 text-[var(--text-primary)]">{product.name}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{unitDisplayLabel(product.unit)}</td>
                        <td className="px-3 py-2 text-right text-[var(--text-primary)]">
                          {product.unit_price.toFixed(2)} EUR
                        </td>
                        <td className="px-3 py-2 text-[var(--text-muted)] text-xs">
                          {product.role_name || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Onboarding tips */}
          {suggestions.onboarding_tips?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                Onboarding-Tipps
              </h3>
              <ul className="space-y-1">
                {suggestions.onboarding_tips.map((tip, i) => (
                  <li key={i} className="text-xs text-[var(--text-muted)] flex items-start gap-2">
                    <span className="text-[var(--accent)] mt-px">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cost + actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
            <div className="flex items-center gap-4">
              <span className="text-xs text-[var(--text-secondary)]">
                {totalSelected} Einträge ausgewählt
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSuggestions(null);
                  setCostEur(null);
                  // Restore pre-filled values that the user entered before the AI run
                  if (preFilledRef.current) {
                    if (preFilledRef.current.industry) setIndustry(preFilledRef.current.industry);
                    if (preFilledRef.current.website) setWebsite(preFilledRef.current.website);
                    if (preFilledRef.current.description) setDescription(preFilledRef.current.description);
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={applying || totalSelected === 0}
                className="bg-[var(--accent)] text-black px-6 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition flex items-center gap-2"
              >
                {applying ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" className="opacity-75" />
                    </svg>
                    Wird übernommen...
                  </>
                ) : (
                  `Übernehmen (${totalSelected})`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success state — SCH-525: confirms what was applied and where to edit later */}
      {applied && (
        <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
          <p className="text-sm text-emerald-400 font-semibold flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            AI-Vorschläge übernommen
          </p>
          <ul className="text-xs text-emerald-400/80 mt-2 space-y-1">
            {selectedRoles.size > 0 && (
              <li>
                <strong>{selectedRoles.size}</strong> {selectedRoles.size === 1 ? "Rolle" : "Rollen"} angelegt — editierbar unter{" "}
                <Link href="/admin" className="underline hover:text-emerald-300">Admin → Rollen</Link>
              </li>
            )}
            {selectedProducts.size > 0 && (
              <li>
                <strong>{selectedProducts.size}</strong> {selectedProducts.size === 1 ? "Produkt" : "Produkte"} angelegt — editierbar unter{" "}
                <Link href="/products" className="underline hover:text-emerald-300">Produkte</Link>
              </li>
            )}
            {selectedCompanyFields.size > 0 && (
              <li>
                <strong>{selectedCompanyFields.size}</strong> Unternehmensdaten-{selectedCompanyFields.size === 1 ? "Feld" : "Felder"} übernommen — editierbar auf dieser Seite unter <em>Unternehmensdaten</em>
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => {
              setSuggestions(null);
              setCostEur(null);
              setApplied(false);
            }}
            className="mt-3 text-xs text-[var(--accent)] hover:underline"
          >
            Erneut Vorschläge laden
          </button>
        </div>
      )}

      {showMissingPopup && missingCompanyFields.length > 0 && (
        <MissingFieldsPopup
          title="AI-Recherche unvollständig"
          intro={`Trotz ${aiPasses ?? "mehrerer"} Recherche-Pässe konnten diese Pflichtfelder nicht aus öffentlichen Quellen ermittelt werden. Trag sie bitte hier nach — sie werden zusammen mit den AI-Vorschlägen übernommen.`}
          fields={missingCompanyFields.map((k) => ({ key: k, ...MISSING_FIELD_SPECS[k] }))}
          initialValues={Object.fromEntries(
            missingCompanyFields.map((k) => {
              const cd = suggestions?.suggested_company_data;
              const v = cd ? cd[k as keyof SuggestedCompanyData] : null;
              return [k, manualCompanyData[k as keyof SuggestedCompanyData] || v || ""];
            }),
          )}
          onSubmit={(values) => {
            setManualCompanyData((prev) => ({ ...prev, ...values }));
            setSelectedCompanyFields((prev) => {
              const next = new Set(prev);
              for (const [k, v] of Object.entries(values)) {
                if (v?.trim()) next.add(k);
              }
              return next;
            });
            setSuggestions((prev) => {
              if (!prev) return prev;
              const cd: SuggestedCompanyData = { ...(prev.suggested_company_data || {} as SuggestedCompanyData) };
              for (const [k, v] of Object.entries(values)) {
                if (v?.trim()) (cd as unknown as Record<string, string | null>)[k] = v.trim();
              }
              return { ...prev, suggested_company_data: cd };
            });
            setShowMissingPopup(false);
          }}
          onClose={() => setShowMissingPopup(false)}
          submitLabel="Felder übernehmen"
        />
      )}
    </div>
  );
}
