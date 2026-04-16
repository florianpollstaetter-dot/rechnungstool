"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TimeEntry } from "@/lib/types";
import { getTimeEntries } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { TabButton } from "@/components/TabButton";

const COLOR_PALETTE = [
  "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899",
  "#14b8a6", "#f97316", "#6366f1", "#a855f7", "#e11d48", "#0891b2", "#d946ef",
];

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getWeekDays(refDate: Date): { label: string; key: string }[] {
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - refDate.getDay() + 1);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { label: d.toLocaleDateString("de-AT", { weekday: "short" }), key: d.toISOString().split("T")[0] };
  });
}

export default function AnalyticsPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "year">("week");
  const [weekOffset, setWeekOffset] = useState(0);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const e = await getTimeEntries();
    // Pauses don't count toward work aggregates (SCH-368)
    setEntries(e.filter((entry) => entry.entry_type !== "pause"));
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const now = new Date();
  const refDate = new Date(now);
  refDate.setDate(now.getDate() + weekOffset * 7);
  const weekDays = getWeekDays(refDate);

  // Week data
  const weekEntries = entries.filter((e) => {
    const d = e.start_time.split("T")[0];
    return d >= weekDays[0].key && d <= weekDays[6].key;
  });

  // Daily totals for bar chart
  const dailyTotals = weekDays.map((day) => {
    const dayEntries = weekEntries.filter((e) => e.start_time.startsWith(day.key));
    return { ...day, total: dayEntries.reduce((s, e) => s + e.duration_minutes, 0) };
  });
  const maxDaily = Math.max(...dailyTotals.map((d) => d.total), 60);

  // Project breakdown
  const projectTotals = new Map<string, number>();
  const periodEntries = period === "week" ? weekEntries
    : period === "month" ? entries.filter((e) => e.start_time.startsWith(now.toISOString().slice(0, 7)))
    : entries;
  periodEntries.forEach((e) => { projectTotals.set(e.project_label, (projectTotals.get(e.project_label) || 0) + e.duration_minutes); });
  const sortedProjects = Array.from(projectTotals.entries()).sort((a, b) => b[1] - a[1]);
  const totalMinutes = sortedProjects.reduce((s, [, m]) => s + m, 0);

  // Billable vs non-billable
  const billableMinutes = periodEntries.filter((e) => e.billable).reduce((s, e) => s + e.duration_minutes, 0);
  const nonBillableMinutes = totalMinutes - billableMinutes;

  // Weekly trend (last 8 weeks)
  const weeklyTrend: { label: string; total: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const ref = new Date(now);
    ref.setDate(now.getDate() - i * 7);
    const days = getWeekDays(ref);
    const total = entries
      .filter((e) => { const d = e.start_time.split("T")[0]; return d >= days[0].key && d <= days[6].key; })
      .reduce((s, e) => s + e.duration_minutes, 0);
    weeklyTrend.push({ label: `KW${Math.ceil((ref.getDate() + new Date(ref.getFullYear(), ref.getMonth(), 1).getDay()) / 7)}`, total });
  }
  const maxWeekly = Math.max(...weeklyTrend.map((w) => w.total), 60);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <Link href="/time" className="text-sm text-gray-500 hover:text-[var(--text-secondary)] transition">&larr; Zurück</Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Auswertungen</h1>
        </div>
        <div className="flex gap-0.5 px-0.5 pb-1 border-b border-[var(--border)]">
          {(["week", "month", "year"] as const).map((p) => (
            <TabButton key={p} active={period === p} onClick={() => setPeriod(p)}>
              {p === "week" ? "Woche" : p === "month" ? "Monat" : "Jahr"}
            </TabButton>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Gesamt</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">{formatDuration(totalMinutes)}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Abrechenbar</p>
          <p className="text-xl font-bold text-emerald-400">{formatDuration(billableMinutes)}</p>
          <p className="text-[10px] text-[var(--text-muted)]">{totalMinutes > 0 ? Math.round(billableMinutes / totalMinutes * 100) : 0}%</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Nicht abrechenbar</p>
          <p className="text-xl font-bold text-[var(--text-secondary)]">{formatDuration(nonBillableMinutes)}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Projekte</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">{sortedProjects.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Weekly bar chart */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Wochenübersicht</h2>
            <div className="flex gap-1">
              <button onClick={() => setWeekOffset((w) => w - 1)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs px-2">&larr;</button>
              <button onClick={() => setWeekOffset(0)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs px-2">Heute</button>
              <button onClick={() => setWeekOffset((w) => w + 1)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs px-2">&rarr;</button>
            </div>
          </div>
          <div className="flex items-end gap-2 h-40">
            {dailyTotals.map((day) => (
              <div key={day.key} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-[var(--text-primary)] font-medium">{day.total > 0 ? formatDuration(day.total) : ""}</span>
                <div className="w-full rounded-t-md bg-[var(--accent)]/80 transition-all" style={{ height: `${Math.max(2, (day.total / maxDaily) * 120)}px` }} />
                <span className="text-[10px] text-[var(--text-muted)]">{day.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Project pie chart */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Projekte</h2>
          <div className="flex items-center gap-6">
            <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
              {(() => {
                let offset = 0;
                return sortedProjects.map(([, mins], i) => {
                  const pct = totalMinutes > 0 ? mins / totalMinutes : 0;
                  const dashArray = `${pct * 314.16} ${314.16 * (1 - pct)}`;
                  const dashOffset = -offset * 314.16;
                  offset += pct;
                  return <circle key={i} cx="60" cy="60" r="46" fill="none" stroke={COLOR_PALETTE[i % COLOR_PALETTE.length]} strokeWidth="18" strokeDasharray={dashArray} strokeDashoffset={dashOffset} transform="rotate(-90 60 60)" />;
                });
              })()}
              <text x="60" y="56" textAnchor="middle" className="text-xs font-bold" fill="var(--text-primary)">{formatDuration(totalMinutes)}</text>
              <text x="60" y="70" textAnchor="middle" className="text-[9px]" fill="var(--text-muted)">Gesamt</text>
            </svg>
            <div className="space-y-1.5 flex-1 max-h-[120px] overflow-y-auto">
              {sortedProjects.map(([project, mins], i) => (
                <div key={project} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLOR_PALETTE[i % COLOR_PALETTE.length] }} />
                  <span className="text-xs text-[var(--text-secondary)] truncate flex-1">{project}</span>
                  <span className="text-xs font-medium text-[var(--text-primary)]">{formatDuration(mins)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Weekly trend */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-6">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Wochentrend (letzte 8 Wochen)</h2>
        <div className="flex items-end gap-3 h-32">
          {weeklyTrend.map((w) => (
            <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-[var(--text-primary)] font-medium">{w.total > 0 ? formatDuration(w.total) : ""}</span>
              <div className="w-full rounded-t-md bg-cyan-500/60 transition-all" style={{ height: `${Math.max(2, (w.total / maxWeekly) * 100)}px` }} />
              <span className="text-[9px] text-[var(--text-muted)]">{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Billable breakdown */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Abrechenbar vs. Intern</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-6 bg-[var(--border)] rounded-full overflow-hidden flex">
            {totalMinutes > 0 && (
              <>
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(billableMinutes / totalMinutes) * 100}%` }} />
                <div className="h-full bg-gray-500 transition-all" style={{ width: `${(nonBillableMinutes / totalMinutes) * 100}%` }} />
              </>
            )}
          </div>
          <div className="flex gap-4 text-xs shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-[var(--text-secondary)]">Abrechenbar {totalMinutes > 0 ? Math.round(billableMinutes / totalMinutes * 100) : 0}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
              <span className="text-[var(--text-secondary)]">Intern {totalMinutes > 0 ? Math.round(nonBillableMinutes / totalMinutes * 100) : 0}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
