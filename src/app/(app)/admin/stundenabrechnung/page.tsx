"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { getUserProfilesForMyCompanies } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/lib/types";

type DayRow = {
  date: string;
  weekday: number; // 0=Mon
  iso_week: number;
  soll_min: number;
  begin: string | null;
  end: string | null;
  pause_min: number;
  ist_min: number;
  ot_25: number;
  ot_50: number;
  ot_100: number;
  tagessaldo_min: number;
  absence: string | null;
};

type WeekRow = { iso_week: number; saldo_min: number };

type StundenReport = {
  user: { id: string; display_name: string; email: string };
  month: string;
  days: DayRow[];
  weeks: WeekRow[];
  month_saldo_min: number;
};

const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function fmtMin(mins: number, showSign = false): string {
  if (mins === 0) return "0h";
  const sign = mins < 0 ? "−" : showSign ? "+" : "";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}m`;
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("de-AT", { month: "long", year: "numeric" });
}

function exportCSV(report: StundenReport) {
  const rows: string[][] = [
    ["Datum", "WT", "KW", "Soll", "Beginn", "Ende", "Pause", "Ist", "+25%", "+50%", "+100%", "Tagessaldo", "Abwesenheit"],
  ];
  for (const d of report.days) {
    rows.push([
      d.date,
      WEEKDAY_SHORT[d.weekday],
      String(d.iso_week),
      fmtMin(d.soll_min),
      d.begin ?? "",
      d.end ?? "",
      fmtMin(d.pause_min),
      fmtMin(d.ist_min),
      fmtMin(d.ot_25),
      fmtMin(d.ot_50),
      fmtMin(d.ot_100),
      fmtMin(d.tagessaldo_min, true),
      d.absence ?? "",
    ]);
  }
  // Weekly saldos footer
  rows.push([]);
  rows.push(["KW", "Wochensaldo"]);
  for (const w of report.weeks) {
    rows.push([`KW ${w.iso_week}`, fmtMin(w.saldo_min, true)]);
  }
  rows.push(["Monatssaldo", fmtMin(report.month_saldo_min, true)]);

  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stundenabrechnung_${report.user.display_name.replace(/\s+/g, "_")}_${report.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StundenabrechnungPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [month, setMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [report, setReport] = useState<StundenReport | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const profiles = await getUserProfilesForMyCompanies();
      const me = profiles.find((p) => p.auth_user_id === user.id);
      if (me?.role !== "admin") { setLoading(false); return; }
      setIsAdmin(true);
      setUsers(profiles);
      if (profiles.length > 0) setSelectedUserId(profiles[0].auth_user_id ?? "");
      setLoading(false);
    })();
  }, []);

  const fetchReport = useCallback(async () => {
    if (!selectedUserId || !month) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stundenabrechnung?user_id=${encodeURIComponent(selectedUserId)}&month=${month}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Fehler beim Laden");
      }
      const data = await res.json() as StundenReport;
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setFetching(false);
    }
  }, [selectedUserId, month]);

  useEffect(() => {
    if (isAdmin && selectedUserId) fetchReport();
  }, [isAdmin, selectedUserId, month, fetchReport]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Kein Admin-Zugriff.</p>
      </div>
    );
  }

  // Group days by ISO week for alternating row colors
  const weekColorMap: Record<number, "even" | "odd"> = {};
  let weekColorToggle = 0;
  if (report) {
    for (const d of report.days) {
      if (!(d.iso_week in weekColorMap)) {
        weekColorMap[d.iso_week] = weekColorToggle % 2 === 0 ? "even" : "odd";
        weekColorToggle++;
      }
    }
  }

  const weekSaldoMap: Record<number, number> = {};
  if (report) {
    for (const w of report.weeks) weekSaldoMap[w.iso_week] = w.saldo_min;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-[var(--text-muted)]">
        <Link href="/admin" className="hover:text-[var(--text-primary)] transition">Admin</Link>
        <span className="mx-2">›</span>
        <span className="text-[var(--text-primary)]">Stundenabrechnung</span>
      </div>

      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Stundenabrechnung</h1>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center mb-6">
        {/* User picker */}
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          {users.map((u) => (
            <option key={u.auth_user_id ?? u.id} value={u.auth_user_id ?? u.id}>
              {u.display_name || u.email}
            </option>
          ))}
        </select>

        {/* Month picker */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth(prevMonth(month))}
            className="w-8 h-8 flex items-center justify-center rounded border border-[var(--border)] hover:bg-[var(--surface)] transition text-[var(--text-secondary)]"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-[var(--text-primary)] min-w-[140px] text-center">
            {monthLabel(month)}
          </span>
          <button
            onClick={() => setMonth(nextMonth(month))}
            className="w-8 h-8 flex items-center justify-center rounded border border-[var(--border)] hover:bg-[var(--surface)] transition text-[var(--text-secondary)]"
          >
            ›
          </button>
        </div>

        {/* CSV export */}
        {report && (
          <button
            onClick={() => exportCSV(report)}
            className="ml-auto px-4 py-2 text-sm font-medium bg-[var(--accent)] text-black rounded-lg hover:brightness-110 transition"
          >
            CSV exportieren
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {fetching && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
        </div>
      )}

      {report && !fetching && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                <th className="px-2 py-2 text-left font-medium text-[var(--text-muted)] w-24">Datum</th>
                <th className="px-2 py-2 text-left font-medium text-[var(--text-muted)] w-8">WT</th>
                <th className="px-2 py-2 text-left font-medium text-[var(--text-muted)] w-10">KW</th>
                <th className="px-2 py-2 text-right font-medium text-[var(--text-muted)]">Soll</th>
                <th className="px-2 py-2 text-right font-medium text-[var(--text-muted)]">Beginn</th>
                <th className="px-2 py-2 text-right font-medium text-[var(--text-muted)]">Ende</th>
                <th className="px-2 py-2 text-right font-medium text-[var(--text-muted)]">Pause</th>
                <th className="px-2 py-2 text-right font-medium text-[var(--text-muted)]">Ist</th>
                <th className="px-2 py-2 text-right font-medium text-[var(--text-muted)]">+25%</th>
                <th className="px-2 py-2 text-right font-medium text-[var(--text-muted)]">+50%</th>
                <th className="px-2 py-2 text-right font-medium text-[var(--text-muted)]">+100%</th>
                <th className="px-2 py-2 text-right font-medium text-[var(--text-muted)]">Tagessaldo</th>
                <th className="px-2 py-2 text-left font-medium text-[var(--text-muted)]">Abw.</th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((day, i) => {
                const isWeekend = day.weekday >= 5;
                const isLastOfWeek = day.weekday === 6 || i === report.days.length - 1;
                const evenOdd = weekColorMap[day.iso_week];
                const bgBase = isWeekend
                  ? "bg-[var(--background)] opacity-60"
                  : evenOdd === "even"
                  ? "bg-[var(--surface)]"
                  : "bg-[var(--background)]";

                return (
                  <React.Fragment key={day.date}>
                    <tr
                      className={`${bgBase} border-b border-[var(--border)]/30 hover:bg-[var(--accent)]/5 transition`}
                    >
                      <td className="px-2 py-1.5 text-[var(--text-secondary)] whitespace-nowrap">
                        {day.date.slice(8)}.{day.date.slice(5, 7)}.
                      </td>
                      <td className={`px-2 py-1.5 font-medium ${isWeekend ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
                        {WEEKDAY_SHORT[day.weekday]}
                      </td>
                      <td className="px-2 py-1.5 text-[var(--text-muted)]">{day.iso_week}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--text-secondary)]">
                        {day.soll_min > 0 ? fmtMin(day.soll_min) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[var(--text-primary)]">
                        {day.begin ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[var(--text-primary)]">
                        {day.end ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[var(--text-secondary)]">
                        {day.pause_min > 0 ? fmtMin(day.pause_min) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium text-[var(--text-primary)]">
                        {day.ist_min > 0 ? fmtMin(day.ist_min) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[var(--text-muted)]">
                        {day.ot_25 > 0 ? fmtMin(day.ot_25) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[var(--text-muted)]">
                        {day.ot_50 > 0 ? fmtMin(day.ot_50) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[var(--text-muted)]">
                        {day.ot_100 > 0 ? fmtMin(day.ot_100) : "—"}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right font-semibold ${
                          day.tagessaldo_min > 0
                            ? "text-green-400"
                            : day.tagessaldo_min < 0
                            ? "text-red-400"
                            : "text-[var(--text-muted)]"
                        }`}
                      >
                        {day.ist_min > 0 || day.soll_min > 0
                          ? fmtMin(day.tagessaldo_min, true)
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[var(--text-muted)] text-xs">
                        {day.absence ?? ""}
                      </td>
                    </tr>
                    {isLastOfWeek && (
                      <tr key={`week-${day.iso_week}`} className="bg-[var(--accent)]/5 border-b border-[var(--border)]">
                        <td colSpan={11} className="px-2 py-1 text-right text-xs font-medium text-[var(--text-muted)]">
                          KW {day.iso_week} Saldo
                        </td>
                        <td
                          className={`px-2 py-1 text-right text-xs font-bold ${
                            (weekSaldoMap[day.iso_week] ?? 0) > 0
                              ? "text-green-400"
                              : (weekSaldoMap[day.iso_week] ?? 0) < 0
                              ? "text-red-400"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {fmtMin(weekSaldoMap[day.iso_week] ?? 0, true)}
                        </td>
                        <td />
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--border)] bg-[var(--surface)]">
                <td colSpan={11} className="px-2 py-2 text-right text-sm font-bold text-[var(--text-primary)]">
                  Monatssaldo {monthLabel(month)}
                </td>
                <td
                  className={`px-2 py-2 text-right text-sm font-bold ${
                    report.month_saldo_min > 0
                      ? "text-green-400"
                      : report.month_saldo_min < 0
                      ? "text-red-400"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {fmtMin(report.month_saldo_min, true)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
