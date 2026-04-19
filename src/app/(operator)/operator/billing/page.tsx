"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface CompanyBilling {
  id: string;
  name: string;
  plan: string;
  status: string;
  trial_ends_at: string | null;
  user_count: number;
}

const PLAN_PRICES: Record<string, number> = {
  trial: 0,
  starter: 19,
  pro: 49,
  enterprise: 149,
};

export default function OperatorBilling() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyBilling[]>([]);
  const [stats, setStats] = useState<{ mrr: number; total_revenue: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [compRes, statsRes] = await Promise.all([
      fetch("/api/operator/companies"),
      fetch("/api/operator/stats"),
    ]);
    if (compRes.status === 403 || compRes.status === 401) {
      router.push(compRes.status === 401 ? "/login" : "/operator");
      return;
    }
    if (compRes.ok) setCompanies(await compRes.json());
    if (statsRes.ok) setStats(await statsRes.json());
    setLoading(false);
  }

  async function changePlan(companyId: string, newPlan: string) {
    await fetch("/api/operator/companies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: companyId, plan: newPlan }),
    });
    await loadData();
  }

  if (loading) return <div className="text-[var(--text-muted)] text-sm py-8 text-center">Lade Billing...</div>;

  const activeCompanies = companies.filter((c) => c.status === "active");
  const payingCompanies = activeCompanies.filter((c) => c.plan !== "trial");

  return (
    <div>
      <h1 className="text-xl font-bold text-[var(--text-primary)] mb-4">Abo & Billing</h1>

      {/* MRR Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <div className="text-xs text-[var(--text-muted)] mb-1">MRR</div>
          <div className="text-lg font-bold text-emerald-500">&euro;{stats?.mrr || 0}</div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <div className="text-xs text-[var(--text-muted)] mb-1">Zahlende Kunden</div>
          <div className="text-lg font-bold text-[var(--text-primary)]">{payingCompanies.length}</div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <div className="text-xs text-[var(--text-muted)] mb-1">Trial-Kunden</div>
          <div className="text-lg font-bold text-yellow-500">{activeCompanies.filter((c) => c.plan === "trial").length}</div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <div className="text-xs text-[var(--text-muted)] mb-1">ARR (hochgerechnet)</div>
          <div className="text-lg font-bold text-[var(--text-primary)]">&euro;{(stats?.mrr || 0) * 12}</div>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-6 text-sm text-amber-600">
        Stripe-Integration kommt in einem zukünftigen Release. Aktuell werden Pläne manuell zugewiesen.
      </div>

      {/* Company Plan Management */}
      <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Plan-Zuweisung</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Unternehmen</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Aktueller Plan</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Preis/Monat</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">User</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-[var(--text-muted)] uppercase">Plan ändern</th>
            </tr>
          </thead>
          <tbody>
            {activeCompanies.map((c) => (
              <tr key={c.id} className="border-b border-[var(--border)]">
                <td className="py-2.5 px-2 font-medium text-[var(--text-primary)]">{c.name}</td>
                <td className="py-2.5 px-2 text-[var(--text-secondary)] capitalize">{c.plan}</td>
                <td className="py-2.5 px-2 text-right font-mono">&euro;{PLAN_PRICES[c.plan] || 0}</td>
                <td className="py-2.5 px-2 text-right font-mono">{c.user_count}</td>
                <td className="py-2.5 px-2">
                  <select
                    value={c.plan}
                    onChange={(e) => changePlan(c.id, e.target.value)}
                    className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  >
                    <option value="trial">Trial</option>
                    <option value="starter">Starter (&euro;19)</option>
                    <option value="pro">Pro (&euro;49)</option>
                    <option value="enterprise">Enterprise (&euro;149)</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
