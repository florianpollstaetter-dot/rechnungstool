"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  trial_ends_at: string | null;
  created_at: string;
  user_count: number;
  receipt_count: number;
  invoice_count: number;
}

const PLAN_BADGES: Record<string, { label: string; cls: string }> = {
  trial: { label: "Trial", cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  starter: { label: "Starter", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  pro: { label: "Pro", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  enterprise: { label: "Enterprise", cls: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
};

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktiv", cls: "bg-emerald-500/10 text-emerald-600" },
  suspended: { label: "Gesperrt", cls: "bg-rose-500/10 text-rose-600" },
  cancelled: { label: "Gekündigt", cls: "bg-gray-500/10 text-gray-500" },
};

export default function OperatorCompanies() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyRow | null>(null);

  useEffect(() => { loadCompanies(); }, []);

  async function loadCompanies() {
    const res = await fetch("/api/operator/companies");
    if (res.status === 403 || res.status === 401) {
      router.push(res.status === 401 ? "/login" : "/operator");
      return;
    }
    if (!res.ok) { setError("Fehler beim Laden"); setLoading(false); return; }
    setCompanies(await res.json());
    setLoading(false);
  }

  async function updateCompany(id: string, updates: Record<string, unknown>) {
    const res = await fetch("/api/operator/companies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (res.ok) {
      await loadCompanies();
      setEditingCompany(null);
    }
  }

  const filtered = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="text-[var(--text-muted)] text-sm py-8 text-center">Lade Firmen...</div>;
  if (error) return <div className="text-rose-500 text-sm py-8 text-center">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Firmen-Verwaltung</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 text-xs font-medium bg-rose-500 text-white rounded-md hover:bg-rose-600 transition-colors"
        >
          + Neue Firma
        </button>
      </div>

      <input
        type="text"
        placeholder="Firma suchen..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Firma</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Plan</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Status</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">User</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Belege</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Rechnungen</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase hidden sm:table-cell">Trial endet</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const planBadge = PLAN_BADGES[c.plan] || { label: c.plan, cls: "bg-gray-500/10 text-gray-500" };
              const statusBadge = STATUS_BADGES[c.status] || { label: c.status, cls: "bg-gray-500/10 text-gray-500" };
              const trialExpired = c.trial_ends_at && new Date(c.trial_ends_at) < new Date();
              return (
                <tr key={c.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="py-2.5 px-2">
                    <div className="font-medium text-[var(--text-primary)]">{c.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{c.slug}</div>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${planBadge.cls}`}>
                      {planBadge.label}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono">{c.user_count}</td>
                  <td className="py-2.5 px-2 text-right font-mono">{c.receipt_count}</td>
                  <td className="py-2.5 px-2 text-right font-mono">{c.invoice_count}</td>
                  <td className="py-2.5 px-2 text-[var(--text-muted)] text-xs hidden sm:table-cell">
                    {c.trial_ends_at ? (
                      <span className={trialExpired ? "text-rose-500" : ""}>
                        {new Date(c.trial_ends_at).toLocaleDateString("de-AT")}
                        {trialExpired && " (abgelaufen)"}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <button
                      onClick={() => setEditingCompany(c)}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Bearbeiten
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-[var(--text-muted)] text-sm py-8">
          {search ? "Keine Firma gefunden" : "Noch keine Firmen registriert"}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && <CreateCompanyModal onClose={() => setShowCreateModal(false)} onCreated={loadCompanies} />}

      {/* Edit Modal */}
      {editingCompany && (
        <EditCompanyModal
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onUpdate={updateCompany}
        />
      )}
    </div>
  );
}

function CreateCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("trial");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name || !slug) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/operator/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, ""), plan }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Fehler");
      setSaving(false);
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Neue Firma erstellen</h2>
        {error && <div className="text-rose-500 text-sm mb-3">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Firmenname</label>
            <input value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")); }}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Kürzel (ID)</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50">
              <option value="trial">Trial</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Abbrechen</button>
          <button onClick={handleCreate} disabled={saving || !name || !slug}
            className="px-3 py-1.5 text-xs font-medium bg-rose-500 text-white rounded-md hover:bg-rose-600 disabled:opacity-50 transition-colors">
            {saving ? "Erstelle..." : "Erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditCompanyModal({
  company,
  onClose,
  onUpdate,
}: {
  company: CompanyRow;
  onClose: () => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>;
}) {
  const [plan, setPlan] = useState(company.plan);
  const [status, setStatus] = useState(company.status);
  const [trialEndsAt, setTrialEndsAt] = useState(
    company.trial_ends_at ? company.trial_ends_at.split("T")[0] : ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updates: Record<string, unknown> = {};
    if (plan !== company.plan) updates.plan = plan;
    if (status !== company.status) updates.status = status;
    if (trialEndsAt && trialEndsAt !== (company.trial_ends_at || "").split("T")[0]) {
      updates.trial_ends_at = new Date(trialEndsAt).toISOString();
    }
    if (Object.keys(updates).length > 0) {
      await onUpdate(company.id, updates);
    }
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">{company.name}</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">ID: {company.id}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50">
              <option value="trial">Trial</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50">
              <option value="active">Aktiv</option>
              <option value="suspended">Gesperrt</option>
              <option value="cancelled">Gekündigt</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Trial endet am</label>
            <input type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50" />
          </div>
        </div>
        <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 mt-4 text-xs text-[var(--text-muted)]">
          <div className="grid grid-cols-3 gap-2">
            <div><span className="font-medium">{company.user_count}</span> User</div>
            <div><span className="font-medium">{company.receipt_count}</span> Belege</div>
            <div><span className="font-medium">{company.invoice_count}</span> Rechnungen</div>
          </div>
          <div className="mt-1">Erstellt: {new Date(company.created_at).toLocaleDateString("de-AT")}</div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Abbrechen</button>
          <button onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 text-xs font-medium bg-rose-500 text-white rounded-md hover:bg-rose-600 disabled:opacity-50 transition-colors">
            {saving ? "Speichere..." : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
