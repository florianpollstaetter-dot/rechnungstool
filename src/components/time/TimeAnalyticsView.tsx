"use client";

import { useState, useMemo } from "react";
import { TimeEntry, UserWorkSchedule, WEEKDAY_LABELS } from "@/lib/types";
import { TabButton } from "@/components/TabButton";

const COLOR_PALETTE = [
  "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899",
  "#14b8a6", "#f97316", "#6366f1", "#a855f7", "#e11d48", "#0891b2", "#d946ef",
];

type Period = "week" | "month" | "year";

function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  return h > 0 ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
}

function formatSaldo(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  const sign = minutes >= 0 ? "+" : "−";
  return h > 0 ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
}

function isoWeekday(date: Date): number {
  const js = date.getDay();
  return js === 0 ? 6 : js - 1;
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = isoWeekday(d);
  d.setDate(d.getDate() - offset);
  return d;
}

function isoCalendarWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  const startStr = start.toLocaleDateString("de-AT", { day: "2-digit", month: sameMonth ? undefined : "2-digit", year: sameYear ? undefined : "numeric" });
  const endStr = end.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

interface TimeAnalyticsViewProps {
  entries: TimeEntry[];
  schedule: UserWorkSchedule[];
}

export function TimeAnalyticsView({ entries, schedule }: TimeAnalyticsViewProps) {
  const [period, setPeriod] = useState<Period>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const workEntries = useMemo(() => entries.filter((e) => e.entry_type !== "pause"), [entries]);
  const pauseEntries = useMemo(() => entries.filter((e) => e.entry_type === "pause"), [entries]);

  const dailyTargets = useMemo(() => {
    const map = new Map<number, number>();
    schedule.forEach((s) => map.set(s.weekday, s.daily_target_minutes));
    return map;
  }, [schedule]);

  const weekTargetMinutes = useMemo(
    () => Array.from({ length: 7 }, (_, i) => dailyTargets.get(i) ?? 0).reduce((s, n) => s + n, 0),
    [dailyTargets]
  );
  const hasSchedule = schedule.length > 0 && weekTargetMinutes > 0;

  const now = useMemo(() => new Date(), []);

  const weekRef = useMemo(() => {
    const ref = new Date(now);
    ref.setDate(ref.getDate() + weekOffset * 7);
    return mondayOf(ref);
  }, [weekOffset, now]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekRef);
        d.setDate(weekRef.getDate() + i);
        return d;
      }),
    [weekRef]
  );

  const todayKey = dateKey(now);
  const isCurrentWeek = weekOffset === 0;
  const currentIsoWeekday = isoWeekday(now);

  const weekDayStats = useMemo(() => {
    return weekDays.map((d, i) => {
      const key = dateKey(d);
      const dayWork = workEntries
        .filter((e) => e.start_time.startsWith(key))
        .reduce((s, e) => s + e.duration_minutes, 0);
      const dayPause = pauseEntries
        .filter((e) => e.start_time.startsWith(key))
        .reduce((s, e) => s + e.duration_minutes, 0);
      const target = dailyTargets.get(i) ?? 0;
      const isToday = key === todayKey;
      const isPast = d.getTime() + 86400000 <= new Date().setHours(0, 0, 0, 0);
      const isFuture = new Date(key).setHours(0, 0, 0, 0) > new Date().setHours(0, 0, 0, 0);
      return { date: d, key, label: WEEKDAY_LABELS[i], weekday: i, work: dayWork, pause: dayPause, target, saldo: dayWork - target, isToday, isPast, isFuture };
    });
  }, [weekDays, workEntries, pauseEntries, dailyTargets, todayKey]);

  const weekWorkTotal = weekDayStats.reduce((s, d) => s + d.work, 0);
  const weekPauseTotal = weekDayStats.reduce((s, d) => s + d.pause, 0);

  const weekTargetToDate = useMemo(() => {
    if (!isCurrentWeek) return weekOffset < 0 ? weekTargetMinutes : 0;
    let total = 0;
    weekDayStats.forEach((d) => {
      if (d.isPast) total += d.target;
      else if (d.isToday) {
        const scheduleRow = schedule.find((s) => s.weekday === d.weekday);
        if (scheduleRow?.start_time && scheduleRow.end_time && d.target > 0) {
          const [sh, sm] = scheduleRow.start_time.split(":").map(Number);
          const [eh, em] = scheduleRow.end_time.split(":").map(Number);
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const startMin = sh * 60 + sm;
          const endMin = eh * 60 + em;
          if (nowMin <= startMin) total += 0;
          else if (nowMin >= endMin) total += d.target;
          else total += Math.round(d.target * ((nowMin - startMin) / Math.max(1, endMin - startMin)));
        } else if (d.target > 0) {
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const frac = Math.min(1, Math.max(0, (nowMin - 9 * 60) / (8 * 60)));
          total += Math.round(d.target * frac);
        }
      }
    });
    return total;
  }, [weekDayStats, schedule, weekTargetMinutes, isCurrentWeek, weekOffset, now]);

  const weekSaldo = weekWorkTotal - weekTargetToDate;
  const weekCatchUp = Math.max(0, weekTargetMinutes - weekWorkTotal);

  const weekForecast = useMemo(() => {
    if (!isCurrentWeek || !hasSchedule) return null;
    const actualPastAndToday = weekDayStats
      .filter((d) => d.isPast || d.isToday)
      .reduce((s, d) => s + d.work, 0);
    const targetPastAndToday = weekDayStats
      .filter((d) => d.isPast || d.isToday)
      .reduce((s, d) => s + d.target, 0);
    const futurePensum = weekDayStats
      .filter((d) => d.isFuture)
      .reduce((s, d) => s + d.target, 0);
    const projected = actualPastAndToday + futurePensum + Math.max(0, (dailyTargets.get(currentIsoWeekday) ?? 0) - (weekDayStats[currentIsoWeekday]?.work ?? 0));
    return { projected, balance: projected - weekTargetMinutes };
  }, [isCurrentWeek, hasSchedule, weekDayStats, dailyTargets, currentIsoWeekday, weekTargetMinutes]);

  // Month
  const monthRef = useMemo(() => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1), [monthOffset, now]);

  const monthDayStats = useMemo(() => {
    const year = monthRef.getFullYear();
    const month = monthRef.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      const key = dateKey(d);
      const work = workEntries.filter((e) => e.start_time.startsWith(key)).reduce((s, e) => s + e.duration_minutes, 0);
      const target = dailyTargets.get(isoWeekday(d)) ?? 0;
      const isToday = key === todayKey;
      const isPast = d.getTime() + 86400000 <= new Date().setHours(0, 0, 0, 0);
      const isFuture = !isPast && !isToday;
      return { date: d, key, work, target, isToday, isPast, isFuture };
    });
  }, [monthRef, workEntries, dailyTargets, todayKey]);

  const monthWorkTotal = monthDayStats.reduce((s, d) => s + d.work, 0);
  const monthTargetToDate = monthDayStats.filter((d) => d.isPast || d.isToday).reduce((s, d) => s + d.target, 0);
  const monthSaldo = monthWorkTotal - monthTargetToDate;

  // Year
  const yearRef = useMemo(() => new Date(now.getFullYear() + yearOffset, 0, 1), [yearOffset, now]);

  const yearMonthStats = useMemo(() => {
    const year = yearRef.getFullYear();
    return Array.from({ length: 12 }, (_, m) => {
      const monthStart = new Date(year, m, 1);
      const monthEnd = new Date(year, m + 1, 0);
      const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
      const work = workEntries.filter((e) => e.start_time.startsWith(monthKey)).reduce((s, e) => s + e.duration_minutes, 0);
      let target = 0;
      for (let day = 1; day <= monthEnd.getDate(); day++) {
        target += dailyTargets.get(isoWeekday(new Date(year, m, day))) ?? 0;
      }
      const isPast = monthEnd.getTime() + 86400000 <= new Date().setHours(0, 0, 0, 0);
      const isCurrent = year === now.getFullYear() && m === now.getMonth();
      return { monthIndex: m, label: monthStart.toLocaleDateString("de-AT", { month: "short" }), work, target, isPast, isCurrent };
    });
  }, [yearRef, workEntries, dailyTargets, now]);

  const yearWorkTotal = yearMonthStats.reduce((s, m) => s + m.work, 0);
  const yearTargetToDate = yearMonthStats
    .filter((m) => m.isPast || m.isCurrent)
    .reduce((s, m) => {
      if (m.isPast) return s + m.target;
      if (m.isCurrent && yearOffset === 0) return s + monthTargetToDate;
      return s;
    }, 0);
  const yearSaldo = yearWorkTotal - yearTargetToDate;

  // Day detail
  const selectedDay = useMemo(() => {
    const key = selectedDayKey ?? (isCurrentWeek ? todayKey : dateKey(weekDays[0]));
    const idx = weekDayStats.findIndex((d) => d.key === key);
    return weekDayStats[idx >= 0 ? idx : 0];
  }, [selectedDayKey, weekDayStats, isCurrentWeek, todayKey, weekDays]);

  // Project breakdown (period-aware)
  const periodEntries = useMemo(() => {
    if (period === "week") {
      const first = dateKey(weekDays[0]);
      const last = dateKey(weekDays[6]);
      return workEntries.filter((e) => { const k = e.start_time.split("T")[0]; return k >= first && k <= last; });
    }
    if (period === "month") {
      const monthKey = `${monthRef.getFullYear()}-${String(monthRef.getMonth() + 1).padStart(2, "0")}`;
      return workEntries.filter((e) => e.start_time.startsWith(monthKey));
    }
    return workEntries.filter((e) => e.start_time.startsWith(String(yearRef.getFullYear())));
  }, [period, weekDays, monthRef, yearRef, workEntries]);

  const projectTotals = useMemo(() => {
    const m = new Map<string, number>();
    periodEntries.forEach((e) => m.set(e.project_label, (m.get(e.project_label) || 0) + e.duration_minutes));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [periodEntries]);

  const periodWorkTotal = projectTotals.reduce((s, [, m]) => s + m, 0);
  const billableMinutes = periodEntries.filter((e) => e.billable).reduce((s, e) => s + e.duration_minutes, 0);
  const nonBillableMinutes = periodWorkTotal - billableMinutes;

  // ---- NEW CHARTS DATA ----

  // SCH-920 K2-L1 — Anchor the trend at the user's first time entry, so weeks
  // before the user started tracking don't drag the cumulative down by the
  // full weekly target each. Without this, a fresh user with a 40h/week model
  // saw -40h, -80h, -120h cumulative bars across the chart and the "Trend"
  // looked broken even though the model was set correctly.
  const firstEntryKey = useMemo(() => {
    if (workEntries.length === 0) return null;
    let min = workEntries[0].start_time;
    for (let i = 1; i < workEntries.length; i++) {
      if (workEntries[i].start_time < min) min = workEntries[i].start_time;
    }
    return min.split("T")[0];
  }, [workEntries]);

  // Hours per week trend (last 8 weeks)
  const weeklyTrend = useMemo(() => {
    const weeks: { label: string; work: number; target: number; isCurrent: boolean; hasData: boolean }[] = [];
    const todayDateKey = dateKey(now);
    for (let i = 7; i >= 0; i--) {
      const ref = new Date(now);
      ref.setDate(ref.getDate() - i * 7);
      const mon = mondayOf(ref);
      const days = Array.from({ length: 7 }, (_, j) => {
        const d = new Date(mon);
        d.setDate(mon.getDate() + j);
        return d;
      });
      const first = dateKey(days[0]);
      const last = dateKey(days[6]);
      const isCurrent = i === 0;
      const work = workEntries.filter((e) => { const k = e.start_time.split("T")[0]; return k >= first && k <= last; }).reduce((s, e) => s + e.duration_minutes, 0);
      // For the current week, only count target up to today so the saldo
      // isn't artificially negative for the rest of the week.
      let target = 0;
      days.forEach((d) => {
        const k = dateKey(d);
        if (isCurrent && k > todayDateKey) return;
        // Skip weekdays before the user's first ever time entry — counting
        // those days would penalise the cumulative saldo for periods before
        // the user even started tracking.
        if (firstEntryKey && k < firstEntryKey) return;
        target += dailyTargets.get(isoWeekday(d)) ?? 0;
      });
      weeks.push({ label: `KW ${isoCalendarWeek(days[0])}`, work, target, isCurrent, hasData: work > 0 || target > 0 });
    }
    return weeks;
  }, [workEntries, dailyTargets, now, firstEntryKey]);

  // Overtime trend (last 8 weeks, cumulative saldo)
  const overtimeTrend = useMemo(() => {
    let cumulative = 0;
    return weeklyTrend.map((w) => {
      const saldo = w.work - w.target;
      cumulative += saldo;
      return { label: w.label, saldo, cumulative, hasData: w.hasData };
    });
  }, [weeklyTrend]);

  // Hours per weekday (average across all data)
  const hoursByWeekday = useMemo(() => {
    const totals = Array(7).fill(0);
    const counts = Array(7).fill(0);
    workEntries.forEach((e) => {
      const d = new Date(e.start_time);
      const wd = isoWeekday(d);
      totals[wd] += e.duration_minutes;
      // Count unique days per weekday
      const key = dateKey(d);
      counts[wd] = counts[wd] || new Set();
    });
    // Recount properly with unique days
    const daysets: Set<string>[] = Array.from({ length: 7 }, () => new Set());
    workEntries.forEach((e) => {
      const d = new Date(e.start_time);
      const wd = isoWeekday(d);
      daysets[wd].add(dateKey(d));
    });
    return WEEKDAY_LABELS.map((label, i) => ({
      label,
      total: totals[i],
      avg: daysets[i].size > 0 ? Math.round(totals[i] / daysets[i].size) : 0,
      target: dailyTargets.get(i) ?? 0,
    }));
  }, [workEntries, dailyTargets]);

  // Navigation
  const gotoPrev = () => {
    if (period === "week") setWeekOffset((w) => w - 1);
    if (period === "month") setMonthOffset((m) => m - 1);
    if (period === "year") setYearOffset((y) => y - 1);
  };
  const gotoNext = () => {
    if (period === "week") setWeekOffset((w) => w + 1);
    if (period === "month") setMonthOffset((m) => m + 1);
    if (period === "year") setYearOffset((y) => y + 1);
  };
  const gotoNow = () => { setWeekOffset(0); setMonthOffset(0); setYearOffset(0); setSelectedDayKey(null); };

  const maxDailyForChart = Math.max(
    weekTargetMinutes > 0 ? Math.max(...weekDayStats.map((d) => d.target)) * 1.3 : 0,
    ...weekDayStats.map((d) => d.work),
    60
  );

  const periodHeaderLabel =
    period === "week"
      ? `KW ${isoCalendarWeek(weekDays[0])} · ${formatDayRange(weekDays[0], weekDays[6])}`
      : period === "month"
      ? monthRef.toLocaleDateString("de-AT", { month: "long", year: "numeric" })
      : String(yearRef.getFullYear());

  const saldoForPeriod = period === "week" ? weekSaldo : period === "month" ? monthSaldo : yearSaldo;
  const workForPeriod = period === "week" ? weekWorkTotal : period === "month" ? monthWorkTotal : yearWorkTotal;
  const targetToDateForPeriod = period === "week" ? weekTargetToDate : period === "month" ? monthTargetToDate : yearTargetToDate;

  return (
    <div className="mt-2">
      {/* Period tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Auswertungen</h2>
        <div className="flex gap-0.5 px-0.5 pb-1 border-b border-[var(--border)]">
          {(["week", "month", "year"] as const).map((p) => (
            <TabButton key={p} active={period === p} onClick={() => setPeriod(p)}>
              {p === "week" ? "Woche" : p === "month" ? "Monat" : "Jahr"}
            </TabButton>
          ))}
        </div>
      </div>

      {/* Period header w/ navigation */}
      <div className="flex items-center justify-between mb-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] px-4 py-3">
        <button onClick={gotoPrev} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm px-2 py-1 rounded hover:bg-[var(--surface-hover)] transition" title="Zurück">&larr;</button>
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{periodHeaderLabel}</p>
          {period === "week" && !isCurrentWeek && (
            <button onClick={gotoNow} className="text-[10px] text-[var(--brand-orange)] hover:underline">Zurück zu heute</button>
          )}
          {period === "month" && monthOffset !== 0 && (
            <button onClick={gotoNow} className="text-[10px] text-[var(--brand-orange)] hover:underline">Zurück zu heute</button>
          )}
          {period === "year" && yearOffset !== 0 && (
            <button onClick={gotoNow} className="text-[10px] text-[var(--brand-orange)] hover:underline">Zurück zu heute</button>
          )}
        </div>
        <button onClick={gotoNext} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm px-2 py-1 rounded hover:bg-[var(--surface-hover)] transition" title="Weiter">&rarr;</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Stunden gesamt</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{formatDuration(workForPeriod)}</p>
          {hasSchedule && (
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Soll bisher: {formatDuration(targetToDateForPeriod)}</p>
          )}
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Saldo</p>
          {hasSchedule ? (
            <p className={`text-2xl font-bold ${saldoForPeriod >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatSaldo(saldoForPeriod)}
            </p>
          ) : (
            <p className="text-sm text-[var(--text-muted)] italic">Kein Arbeitszeitmodell gesetzt</p>
          )}
          {hasSchedule && (
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">vs. Soll bis heute</p>
          )}
        </div>
        {period === "week" && hasSchedule && (
          <>
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--text-muted)]">Noch aufzuholen</p>
              <p className={`text-2xl font-bold ${weekCatchUp > 0 ? "text-[var(--brand-orange)]" : "text-emerald-400"}`}>
                {weekCatchUp > 0 ? formatDuration(weekCatchUp) : "0h"}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {weekCatchUp > 0 ? `bis KW-Soll (${formatDuration(weekTargetMinutes)})` : "Wochen-Soll erreicht"}
              </p>
            </div>
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--text-muted)]">Prognose KW-Saldo</p>
              {weekForecast ? (
                <p className={`text-2xl font-bold ${weekForecast.balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {formatSaldo(weekForecast.balance)}
                </p>
              ) : (
                <p className="text-sm text-[var(--text-muted)] italic">—</p>
              )}
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">bei Pensum für Resttage</p>
            </div>
          </>
        )}
        {period !== "week" && (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Abrechenbar</p>
            <p className="text-2xl font-bold text-emerald-400">{formatDuration(billableMinutes)}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {periodWorkTotal > 0 ? Math.round(billableMinutes / periodWorkTotal * 100) : 0}% der Stunden
            </p>
          </div>
        )}
        {period !== "week" && (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Projekte</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{projectTotals.length}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">im Zeitraum</p>
          </div>
        )}
      </div>

      {/* Week chart */}
      {period === "week" && (
        <>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Wochenchart</h2>
              {weekPauseTotal > 0 && (
                <span className="text-[10px] text-amber-400/80">+ {formatDuration(weekPauseTotal)} Pause</span>
              )}
            </div>
            <div className="flex items-end gap-2 h-52 relative pt-6">
              {weekDayStats.map((day) => {
                const barHeight = Math.max(2, (day.work / maxDailyForChart) * 180);
                const overPart = day.work > day.target && day.target > 0
                  ? ((day.work - day.target) / maxDailyForChart) * 180
                  : 0;
                const underPart = Math.max(0, barHeight - overPart);
                const targetHeight = day.target > 0 ? (day.target / maxDailyForChart) * 180 : 0;
                const selected = selectedDay?.key === day.key;
                return (
                  <button
                    key={day.key}
                    onClick={() => setSelectedDayKey(day.key)}
                    className={`flex-1 flex flex-col items-center gap-1 group relative cursor-pointer focus:outline-none ${day.isFuture ? "opacity-40" : ""}`}
                    title={`${day.label} ${day.date.toLocaleDateString("de-AT")}: ${formatDuration(day.work)}${day.target > 0 ? ` / Soll ${formatDuration(day.target)}` : ""}`}
                  >
                    <span className="text-[10px] text-[var(--text-primary)] font-medium h-3">
                      {day.work > 0 ? formatDuration(day.work) : ""}
                    </span>
                    <div className="w-full relative flex flex-col-reverse" style={{ height: "180px" }}>
                      {day.target > 0 && (
                        <div className="absolute left-0 right-0 border-t-2 border-dashed border-[var(--text-muted)]/60 z-10" style={{ bottom: `${targetHeight}px` }}>
                          <span className="absolute -top-4 right-0 text-[9px] text-[var(--text-muted)]">{formatDuration(day.target)}</span>
                        </div>
                      )}
                      <div
                        className={`w-full rounded-t-md transition-all ${selected ? "ring-2 ring-[var(--brand-orange)] ring-offset-1 ring-offset-[var(--surface)]" : ""}`}
                        style={{
                          height: `${underPart}px`,
                          backgroundColor: day.isToday ? "var(--brand-orange)" : day.target > 0 && day.work >= day.target ? "#10b981" : "#3b82f6",
                          opacity: 0.85,
                        }}
                      />
                      {overPart > 0 && (
                        <div className="w-full" style={{ height: `${overPart}px`, backgroundColor: "#f59e0b", borderRadius: "0.375rem 0.375rem 0 0" }} title="Über Soll" />
                      )}
                    </div>
                    <span className={`text-[10px] ${day.isToday ? "text-[var(--brand-orange)] font-semibold" : "text-[var(--text-muted)]"}`}>{day.label}</span>
                  </button>
                );
              })}
            </div>
            {hasSchedule && (
              <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#3b82f6" }} />unter Soll</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#10b981" }} />Soll erreicht</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#f59e0b" }} />über Soll</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "var(--brand-orange)" }} />heute</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-[2px] bg-[var(--text-muted)]/60" style={{ borderTop: "2px dashed" }} />Tagessoll</span>
              </div>
            )}
          </div>

          {/* Day detail */}
          {selectedDay && (
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide">Tagesdetail</p>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    {selectedDay.date.toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "long" })}
                    {selectedDay.isToday && <span className="text-[var(--brand-orange)] ml-2">· heute</span>}
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-[var(--text-muted)]">Gesamt</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{formatDuration(selectedDay.work + selectedDay.pause)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-muted)]">Arbeitszeit</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{formatDuration(selectedDay.work)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-muted)]">Saldo</p>
                  {selectedDay.target > 0 ? (
                    <p className={`text-lg font-bold ${selectedDay.saldo >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatSaldo(selectedDay.saldo)}</p>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] italic">kein Soll</p>
                  )}
                  {selectedDay.target > 0 && (
                    <p className="text-[10px] text-[var(--text-muted)]">Soll {formatDuration(selectedDay.target)}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-muted)]">Pause</p>
                  <p className="text-lg font-bold text-amber-400">{selectedDay.pause > 0 ? formatDuration(selectedDay.pause) : "—"}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Month chart */}
      {period === "month" && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Monatsübersicht</h2>
          <div className="flex items-end gap-[3px] h-40">
            {monthDayStats.map((d) => {
              const max = Math.max(...monthDayStats.map((x) => Math.max(x.work, x.target)), 60);
              const barH = Math.max(1, (d.work / max) * 120);
              const targetH = d.target > 0 ? (d.target / max) * 120 : 0;
              const over = d.work > d.target && d.target > 0 ? ((d.work - d.target) / max) * 120 : 0;
              return (
                <div key={d.key} className={`flex-1 flex flex-col items-center ${d.isFuture ? "opacity-40" : ""}`} title={`${d.date.toLocaleDateString("de-AT")}: ${formatDuration(d.work)}${d.target > 0 ? ` / ${formatDuration(d.target)}` : ""}`}>
                  <div className="w-full relative flex flex-col-reverse" style={{ height: "120px" }}>
                    {d.target > 0 && (
                      <div className="absolute left-0 right-0 border-t border-dashed border-[var(--text-muted)]/40" style={{ bottom: `${targetH}px` }} />
                    )}
                    <div className="w-full" style={{ height: `${Math.max(0, barH - over)}px`, backgroundColor: d.isToday ? "var(--brand-orange)" : "#3b82f6", opacity: 0.85 }} />
                    {over > 0 && <div className="w-full" style={{ height: `${over}px`, backgroundColor: "#f59e0b" }} />}
                  </div>
                  <span className="text-[8px] text-[var(--text-muted)] mt-0.5">{d.date.getDate()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Year chart */}
      {period === "year" && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Jahresübersicht</h2>
          <div className="flex items-end gap-2 h-40">
            {yearMonthStats.map((m) => {
              const max = Math.max(...yearMonthStats.map((x) => Math.max(x.work, x.target)), 60);
              const barH = Math.max(2, (m.work / max) * 120);
              const targetH = m.target > 0 ? (m.target / max) * 120 : 0;
              const over = m.work > m.target && m.target > 0 ? ((m.work - m.target) / max) * 120 : 0;
              const future = !m.isPast && !m.isCurrent;
              return (
                <div key={m.monthIndex} className={`flex-1 flex flex-col items-center gap-1 ${future ? "opacity-40" : ""}`} title={`${m.label}: ${formatDuration(m.work)}${m.target > 0 ? ` / ${formatDuration(m.target)}` : ""}`}>
                  <span className="text-[9px] text-[var(--text-primary)] font-medium">{m.work > 0 ? Math.round(m.work / 60) + "h" : ""}</span>
                  <div className="w-full relative flex flex-col-reverse" style={{ height: "120px" }}>
                    {m.target > 0 && (
                      <div className="absolute left-0 right-0 border-t border-dashed border-[var(--text-muted)]/40" style={{ bottom: `${targetH}px` }} />
                    )}
                    <div className="w-full rounded-t-md" style={{ height: `${Math.max(0, barH - over)}px`, backgroundColor: m.isCurrent ? "var(--brand-orange)" : "#3b82f6", opacity: 0.85 }} />
                    {over > 0 && <div className="w-full" style={{ height: `${over}px`, backgroundColor: "#f59e0b", borderRadius: "0.375rem 0.375rem 0 0" }} />}
                  </div>
                  <span className={`text-[10px] ${m.isCurrent ? "text-[var(--brand-orange)] font-semibold" : "text-[var(--text-muted)]"}`}>{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Project pie + billable breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Projekte</h2>
          {projectTotals.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">Keine Einträge im Zeitraum.</p>
          ) : (
            <div className="flex items-center gap-6">
              <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
                {(() => {
                  let offset = 0;
                  return projectTotals.map(([, mins], i) => {
                    const pct = periodWorkTotal > 0 ? mins / periodWorkTotal : 0;
                    const dashArray = `${pct * 314.16} ${314.16 * (1 - pct)}`;
                    const dashOffset = -offset * 314.16;
                    offset += pct;
                    return <circle key={i} cx="60" cy="60" r="46" fill="none" stroke={COLOR_PALETTE[i % COLOR_PALETTE.length]} strokeWidth="18" strokeDasharray={dashArray} strokeDashoffset={dashOffset} transform="rotate(-90 60 60)" />;
                  });
                })()}
                <text x="60" y="56" textAnchor="middle" className="text-xs font-bold" fill="var(--text-primary)">{formatDuration(periodWorkTotal)}</text>
                <text x="60" y="70" textAnchor="middle" className="text-[9px]" fill="var(--text-muted)">Gesamt</text>
              </svg>
              <div className="space-y-1.5 flex-1 max-h-[120px] overflow-y-auto">
                {projectTotals.map(([project, mins], i) => (
                  <div key={project} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLOR_PALETTE[i % COLOR_PALETTE.length] }} />
                    <span className="text-xs text-[var(--text-secondary)] truncate flex-1">{project}</span>
                    <span className="text-xs font-medium text-[var(--text-primary)]">{formatDuration(mins)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Abrechenbar vs. Intern</h2>
          {periodWorkTotal === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">Keine Einträge im Zeitraum.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex-1 h-6 bg-[var(--border)] rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(billableMinutes / periodWorkTotal) * 100}%` }} />
                <div className="h-full bg-gray-500 transition-all" style={{ width: `${(nonBillableMinutes / periodWorkTotal) * 100}%` }} />
              </div>
              <div className="flex flex-col gap-1 text-xs shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-[var(--text-secondary)]">Abrechenbar {Math.round(billableMinutes / periodWorkTotal * 100)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                  <span className="text-[var(--text-secondary)]">Intern {Math.round(nonBillableMinutes / periodWorkTotal * 100)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NEW: Weekly trend (last 8 weeks) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Stunden pro Woche (Trend)</h2>
          {(() => {
            const maxWork = Math.max(...weeklyTrend.map((w) => Math.max(w.work, w.target)), 60);
            return (
              <div className="flex items-end gap-2 h-36">
                {weeklyTrend.map((w, i) => {
                  const barH = Math.max(2, (w.work / maxWork) * 110);
                  const targetH = w.target > 0 ? (w.target / maxWork) * 110 : 0;
                  const isLast = i === weeklyTrend.length - 1;
                  return (
                    <div key={w.label} className="flex-1 flex flex-col items-center gap-1" title={`${w.label}: ${formatDuration(w.work)}${w.target > 0 ? ` / Soll ${formatDuration(w.target)}` : ""}`}>
                      <span className="text-[9px] text-[var(--text-primary)] font-medium">{w.work > 0 ? Math.round(w.work / 60) + "h" : ""}</span>
                      <div className="w-full relative flex flex-col-reverse" style={{ height: "110px" }}>
                        {w.target > 0 && (
                          <div className="absolute left-0 right-0 border-t border-dashed border-[var(--text-muted)]/40" style={{ bottom: `${targetH}px` }} />
                        )}
                        <div className="w-full rounded-t-md" style={{ height: `${barH}px`, backgroundColor: isLast ? "var(--brand-orange)" : "#3b82f6", opacity: 0.85 }} />
                      </div>
                      <span className={`text-[9px] ${isLast ? "text-[var(--brand-orange)] font-semibold" : "text-[var(--text-muted)]"}`}>{w.label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* NEW: Overtime trend (cumulative) — SCH-920 K2-L1 */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Überstunden-Trend</h2>
          {!hasSchedule ? (
            <p className="text-sm text-[var(--text-muted)] italic">Kein Arbeitszeitmodell gesetzt</p>
          ) : (() => {
            const maxAbs = Math.max(...overtimeTrend.map((o) => Math.abs(o.cumulative)), 60);
            const chartH = 110;
            const midY = chartH / 2;
            const labelRowH = 18;
            const totalH = chartH + labelRowH;
            return (
              <div className="relative" style={{ height: `${totalH}px` }}>
                {/* Zero line aligned with the bars' midline */}
                <div className="absolute left-0 right-0 border-t border-[var(--text-muted)]/30" style={{ top: `${midY}px` }}>
                  <span className="absolute -top-3 left-0 text-[9px] text-[var(--text-muted)]">0h</span>
                </div>
                <div className="absolute inset-0 flex gap-2">
                  {overtimeTrend.map((o, i) => {
                    const barH = o.hasData
                      ? Math.max(2, (Math.abs(o.cumulative) / maxAbs) * (chartH / 2 - 5))
                      : 0;
                    const isPositive = o.cumulative >= 0;
                    const isLast = i === overtimeTrend.length - 1;
                    return (
                      <div key={o.label} className="flex-1 relative" title={`${o.label}: Saldo ${formatSaldo(o.cumulative)}`}>
                        {/* Bar — anchored exactly to the zero line so positive
                            bars grow up and negative bars grow down without a
                            vertical offset */}
                        {barH > 0 && (
                          <div
                            className="absolute left-0 right-0 rounded-md"
                            style={{
                              height: `${barH}px`,
                              top: isPositive ? `${midY - barH}px` : `${midY}px`,
                              backgroundColor: isLast ? "var(--brand-orange)" : isPositive ? "#10b981" : "#f43f5e",
                              opacity: 0.85,
                            }}
                          />
                        )}
                        {/* Saldo label */}
                        {o.hasData && o.cumulative !== 0 && (
                          <span
                            className="text-[9px] font-medium absolute left-0 right-0 text-center"
                            style={{
                              top: isPositive ? `${midY - barH - 14}px` : `${midY + barH + 2}px`,
                              color: isPositive ? "#10b981" : "#f43f5e",
                            }}
                          >
                            {formatSaldo(o.cumulative)}
                          </span>
                        )}
                        {/* Week label pinned to the bottom row */}
                        <span
                          className={`text-[9px] absolute left-0 right-0 text-center ${isLast ? "text-[var(--brand-orange)] font-semibold" : "text-[var(--text-muted)]"}`}
                          style={{ top: `${chartH + 2}px` }}
                        >
                          {o.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* NEW: Top 5 projects + hours per weekday */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Top 5 projects */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Top-5-Projekte nach Stunden</h2>
          {projectTotals.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">Keine Einträge im Zeitraum.</p>
          ) : (
            <div className="space-y-2.5">
              {projectTotals.slice(0, 5).map(([project, mins], i) => {
                const pct = periodWorkTotal > 0 ? (mins / periodWorkTotal) * 100 : 0;
                return (
                  <div key={project}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLOR_PALETTE[i % COLOR_PALETTE.length] }} />
                        <span className="text-xs text-[var(--text-secondary)] truncate max-w-[160px]">{project}</span>
                      </div>
                      <span className="text-xs font-medium text-[var(--text-primary)]">{formatDuration(mins)} ({Math.round(pct)}%)</span>
                    </div>
                    <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: COLOR_PALETTE[i % COLOR_PALETTE.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hours per weekday (average) */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Stunden pro Wochentag (Durchschnitt)</h2>
          {(() => {
            const maxAvg = Math.max(...hoursByWeekday.map((d) => Math.max(d.avg, d.target)), 60);
            return (
              <div className="flex items-end gap-2 h-36">
                {hoursByWeekday.map((d) => {
                  const barH = Math.max(2, (d.avg / maxAvg) * 110);
                  const targetH = d.target > 0 ? (d.target / maxAvg) * 110 : 0;
                  return (
                    <div key={d.label} className="flex-1 flex flex-col items-center gap-1" title={`${d.label}: Ø ${formatDuration(d.avg)}${d.target > 0 ? ` / Soll ${formatDuration(d.target)}` : ""}`}>
                      <span className="text-[9px] text-[var(--text-primary)] font-medium">{d.avg > 0 ? formatDuration(d.avg) : ""}</span>
                      <div className="w-full relative flex flex-col-reverse" style={{ height: "110px" }}>
                        {d.target > 0 && (
                          <div className="absolute left-0 right-0 border-t border-dashed border-[var(--text-muted)]/40" style={{ bottom: `${targetH}px` }} />
                        )}
                        <div className="w-full rounded-t-md" style={{ height: `${barH}px`, backgroundColor: d.target > 0 && d.avg >= d.target ? "#10b981" : "#3b82f6", opacity: 0.85 }} />
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {!hasSchedule && (
        <div className="bg-[var(--brand-orange-dim)] border border-[var(--brand-orange)]/40 rounded-xl p-4 text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--brand-orange)]">Hinweis:</strong> Für Saldo, Soll und Prognose muss ein Arbeitszeitmodell hinterlegt werden.
        </div>
      )}
    </div>
  );
}
