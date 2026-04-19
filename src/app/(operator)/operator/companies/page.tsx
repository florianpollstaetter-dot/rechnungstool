"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  trial_ends_at: string | null;
  created_at: string;
  subscription_status: "paid" | "outstanding" | "overdue" | null;
  is_free: boolean | null;
  last_payment_at: string | null;
  next_payment_due_at: string | null;
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

type PaymentFilter = "all" | "paid" | "outstanding" | "overdue" | "free";
type SortKey = "created_desc" | "overdue_days_desc" | "next_due_asc" | "payment_status";

const PAYMENT_FILTERS: { key: PaymentFilter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "paid", label: "Bezahlt" },
  { key: "outstanding", label: "Offen" },
  { key: "overdue", label: "Überfällig" },
  { key: "free", label: "Gratis" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created_desc", label: "Neueste zuerst" },
  { key: "overdue_days_desc", label: "Tage überfällig" },
  { key: "next_due_asc", label: "Nächste Fälligkeit" },
  { key: "payment_status", label: "Nach Zahlungsstatus" },
];

function daysOverdue(nextDueAt: string | null): number {
  if (!nextDueAt) return 0;
  const due = new Date(nextDueAt).getTime();
  if (Number.isNaN(due)) return 0;
  const diffMs = Date.now() - due;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function PaymentBadge({ row }: { row: CompanyRow }) {
  if (row.is_free) {
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-sky-500/10 text-sky-600 border border-sky-500/20">
        Gratis
      </span>
    );
  }
  const status = row.subscription_status || "paid";
  if (status === "overdue") {
    const days = daysOverdue(row.next_payment_due_at);
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
        Überfällig{days > 0 ? ` · ${days}T` : ""}
      </span>
    );
  }
  if (status === "outstanding") {
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
        Offen
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
      Bezahlt
    </span>
  );
}

export default function OperatorCompanies() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_desc");
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  const counts = useMemo(() => {
    const agg = { all: 0, paid: 0, outstanding: 0, overdue: 0, free: 0 };
    for (const c of companies) {
      agg.all += 1;
      if (c.is_free) { agg.free += 1; continue; }
      const s = c.subscription_status || "paid";
      if (s === "paid") agg.paid += 1;
      else if (s === "outstanding") agg.outstanding += 1;
      else if (s === "overdue") agg.overdue += 1;
    }
    return agg;
  }, [companies]);

  const filteredSorted = useMemo(() => {
    const q = search.toLowerCase();
    const searched = companies.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
    const payFiltered = searched.filter((c) => {
      if (paymentFilter === "all") return true;
      if (paymentFilter === "free") return !!c.is_free;
      if (c.is_free) return false;
      const s = c.subscription_status || "paid";
      return s === paymentFilter;
    });
    const rank = (c: CompanyRow) => {
      if (c.is_free) return 4;
      const s = c.subscription_status || "paid";
      if (s === "overdue") return 0;
      if (s === "outstanding") return 1;
      if (s === "paid") return 2;
      return 3;
    };
    const sorted = [...payFiltered];
    if (sortKey === "created_desc") {
      sorted.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    } else if (sortKey === "overdue_days_desc") {
      sorted.sort((a, b) => daysOverdue(b.next_payment_due_at) - daysOverdue(a.next_payment_due_at));
    } else if (sortKey === "next_due_asc") {
      sorted.sort((a, b) => {
        const av = a.next_payment_due_at ? new Date(a.next_payment_due_at).getTime() : Number.POSITIVE_INFINITY;
        const bv = b.next_payment_due_at ? new Date(b.next_payment_due_at).getTime() : Number.POSITIVE_INFINITY;
        return av - bv;
      });
    } else if (sortKey === "payment_status") {
      sorted.sort((a, b) => rank(a) - rank(b) || daysOverdue(b.next_payment_due_at) - daysOverdue(a.next_payment_due_at));
    }
    return sorted;
  }, [companies, search, paymentFilter, sortKey]);

  if (loading) return <div className="text-[var(--text-muted)] text-sm py-8 text-center">Lade Unternehmen...</div>;
  if (error) return <div className="text-rose-500 text-sm py-8 text-center">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Unternehmens-Verwaltung</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 text-xs font-medium bg-rose-500 text-white rounded-md hover:bg-rose-600 transition-colors"
        >
          + Neues Unternehmen
        </button>
      </div>

      <input
        type="text"
        placeholder="Unternehmen suchen..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-3 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50"
      />

      <div className="flex flex-wrap gap-2 mb-3">
        {PAYMENT_FILTERS.map((f) => {
          const active = paymentFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setPaymentFilter(f.key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                active
                  ? "bg-rose-500 text-white border-rose-500"
                  : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f.label} <span className={active ? "opacity-80" : "text-[var(--text-muted)]"}>({counts[f.key]})</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-[var(--text-muted)]">Sortieren:</span>
        {SORT_OPTIONS.map((s) => {
          const active = sortKey === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSortKey(s.key)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                active
                  ? "bg-[var(--text-primary)] text-[var(--background)] border-[var(--text-primary)]"
                  : "bg-transparent border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Unternehmen</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Plan</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Zahlung</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Status</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">User</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Belege</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Rechnungen</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase hidden sm:table-cell">Trial endet</th>
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map((c) => {
              const planBadge = PLAN_BADGES[c.plan] || { label: c.plan, cls: "bg-gray-500/10 text-gray-500" };
              const statusBadge = STATUS_BADGES[c.status] || { label: c.status, cls: "bg-gray-500/10 text-gray-500" };
              const trialExpired = c.trial_ends_at && new Date(c.trial_ends_at) < new Date();
              return (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/operator/companies/${c.id}`)}
                  className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                >
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
                    <PaymentBadge row={c} />
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredSorted.length === 0 && (
        <div className="text-center text-[var(--text-muted)] text-sm py-8">
          {search || paymentFilter !== "all" ? "Kein Unternehmen gefunden" : "Noch keine Unternehmen registriert"}
        </div>
      )}

      {showCreateModal && <CreateCompanyModal onClose={() => setShowCreateModal(false)} onCreated={loadCompanies} />}
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
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Neues Unternehmen erstellen</h2>
        {error && <div className="text-rose-500 text-sm mb-3">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Unternehmensname</label>
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
