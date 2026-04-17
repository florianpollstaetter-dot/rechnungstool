"use client";

// SCH-386 — AI-Firmen-Setup: Vorschläge laden und bei Firmenanlage anwenden.

import { useState } from "react";
import { createCompanyRole, createProduct, getCompanyRoles } from "@/lib/db";
import { UnitType } from "@/lib/types";
import { useCompany } from "@/lib/company-context";

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

interface Suggestions {
  detected_industry: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
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
}

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-rose-400",
};

export default function AiCompanySetup({ companyName }: { companyName: string }) {
  const { company } = useCompany();

  // Form fields
  const [name, setName] = useState(companyName);
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");

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

  async function handleFetch() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    setSuggestions(null);
    setApplied(false);

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

      // Select all by default
      setSelectedRoles(new Set(data.suggestions.suggested_roles.map((_, i) => i)));
      setSelectedProducts(new Set(data.suggestions.suggested_products.map((_, i) => i)));
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

  async function handleApply() {
    if (!suggestions) return;
    setApplying(true);
    setError(null);

    try {
      // 1. Create selected roles first (we need their IDs for product role_id mapping)
      const roleNameToId: Record<string, string> = {};

      // Get existing roles to avoid duplicates
      const existingRoles = await getCompanyRoles();
      const existingRoleNames = new Set(existingRoles.map((r) => r.name.toLowerCase()));

      for (const idx of selectedRoles) {
        const role = suggestions.suggested_roles[idx];
        if (existingRoleNames.has(role.name.toLowerCase())) {
          // Find existing role ID
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

      setApplied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Anwenden");
    } finally {
      setApplying(false);
    }
  }

  const totalSelected = selectedRoles.size + selectedProducts.size;

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">AI-Firmen-Setup</h2>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
          Beta
        </span>
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
                Firmenname *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="z.B. VR the Fans GmbH"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Branche
              </label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className={inputClass}
                placeholder="z.B. Filmproduktion, IT, Gastronomie"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Website
              </label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className={inputClass}
                placeholder="z.B. www.firma.at"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Beschreibung
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
                placeholder="Was macht die Firma?"
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
                AI analysiert...
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

          {/* Roles */}
          {suggestions.suggested_roles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Rollen ({selectedRoles.size}/{suggestions.suggested_roles.length})
                </h3>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestions.suggested_roles.map((role, i) => (
                  <label
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedRoles.has(i)
                        ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                        : "border-[var(--border)] hover:border-gray-500"
                    }`}
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
                ))}
              </div>
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
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(i)}
                            onChange={() => toggleProduct(i)}
                            className="accent-[var(--accent)]"
                          />
                        </td>
                        <td className="px-3 py-2 text-[var(--text-primary)]">{product.name}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{product.unit}</td>
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
              {costEur != null && (
                <span className="text-xs text-[var(--text-muted)]">
                  AI-Analyse: {costEur.toFixed(4)} EUR
                </span>
              )}
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

      {/* Success state */}
      {applied && (
        <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
          <p className="text-sm text-emerald-400 font-medium">
            Vorschläge erfolgreich übernommen!
          </p>
          <p className="text-xs text-emerald-400/70 mt-1">
            {selectedRoles.size} Rollen und {selectedProducts.size} Produkte wurden angelegt. Sie
            finden diese jetzt unter Admin bzw. Produkte.
          </p>
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
    </div>
  );
}
