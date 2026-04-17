"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Stats {
  total_companies: number;
  total_users: number;
  total_invoices: number;
  total_receipts: number;
  plan_breakdown: Record<string, number>;
  status_breakdown: Record<string, number>;
  expiring_trials: number;
  mrr: number;
  new_companies_this_month: number;
  new_users_this_month: number;
  total_revenue: number;
}

export default function OperatorDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    checkAccessAndLoad();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function checkAccessAndLoad() {
    // Quick client-side auth check
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    // Load stats from API (API does superadmin check)
    try {
      const res = await fetch("/api/operator/stats");
      if (res.status === 403) {
        setError("Kein Zugriff. Nur Superadmins können die Operator Console verwenden.");
        setLoading(false);
        return;
      }
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error("Fehler beim Laden");
      setStats(await res.json());
      setAuthorized(true);
    } catch {
      setError("Fehler beim Laden der Statistiken");
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[var(--text-muted)] text-sm">Lade Operator Console...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-rose-500 text-lg font-semibold mb-2">Zugriff verweigert</div>
          <div className="text-[var(--text-muted)] text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (!stats || !authorized) return null;

  const PLAN_LABELS: Record<string, string> = {
    trial: "Trial",
    starter: "Starter",
    pro: "Pro",
    enterprise: "Enterprise",
  };

  const PLAN_COLORS: Record<string, string> = {
    trial: "text-yellow-500",
    starter: "text-blue-500",
    pro: "text-emerald-500",
    enterprise: "text-purple-500",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Operator Dashboard</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">Plattform-Übersicht für Orange Octo</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Firmen" value={stats.total_companies} />
        <StatCard label="User" value={stats.total_users} />
        <StatCard label="MRR" value={`€${stats.mrr}`} accent />
        <StatCard label="Ablaufende Trials" value={stats.expiring_trials} warn={stats.expiring_trials > 0} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Plan Breakdown */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Plan-Verteilung</h3>
          <div className="space-y-2">
            {Object.entries(stats.plan_breakdown).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between">
                <span className={`text-sm font-medium ${PLAN_COLORS[plan] || "text-[var(--text-secondary)]"}`}>
                  {PLAN_LABELS[plan] || plan}
                </span>
                <span className="text-sm text-[var(--text-primary)] font-mono">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Status-Verteilung</h3>
          <div className="space-y-2">
            {Object.entries(stats.status_breakdown).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)] capitalize">{status}</span>
                <span className="text-sm text-[var(--text-primary)] font-mono">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Neue Firmen (Monat)" value={stats.new_companies_this_month} />
        <StatCard label="Neue User (Monat)" value={stats.new_users_this_month} />
        <StatCard label="Rechnungen gesamt" value={stats.total_invoices} />
        <StatCard label="Belege gesamt" value={stats.total_receipts} />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, warn }: { label: string; value: number | string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
      <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
      <div className={`text-lg font-bold ${warn ? "text-rose-500" : accent ? "text-emerald-500" : "text-[var(--text-primary)]"}`}>
        {value}
      </div>
    </div>
  );
}
