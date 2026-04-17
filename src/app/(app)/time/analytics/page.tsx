"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { TimeEntry, UserWorkSchedule, WEEKDAY_LABELS } from "@/lib/types";
import { getTimeEntries, getCurrentUserWorkSchedules } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { TabButton } from "@/components/TabButton";
import { useI18n } from "@/lib/i18n-context";

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

// Map JS getDay() (0=Sun, 1=Mon, …, 6=Sat) to ISO-style weekday (0=Mon, 6=Sun).
function isoWeekday(date: Date): number {
  const js = date.getDay();
  return js === 0 ? 6 : js - 1;
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = isoWeekday(d); // Mon=0, so d - offset = Monday
  d.setDate(d.getDate() - offset);
  return d;
}

function isoCalendarWeek(date: Date): number {
  // ISO 8601 week number
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

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [schedule, setSchedule] = useState<UserWorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [e, sch] = await Promise.all([getTimeEntries(user.id), getCurrentUserWorkSchedules()]);
    setEntries(e);
    setSchedule(sch);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Pauses never count toward work aggregates (SCH-368).
  const workEntries = useMemo(() => entries.filter((e) => e.entry_type !== "pause"), [entries]);
  const pauseEntries = useMemo(() => entries.filter((e) => e.entry_type === "pause"), [entries]);

  // Build a weekday→target lookup. Days without a row are treated as 0-target rest days.
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

  // ------------------------------------------------------------------
  // WEEK AGGREGATES (Woche tab)
  // ------------------------------------------------------------------
  // Stable "now" pinned to mount — stops useMemo dependency arrays from
  // invalidating on every render. Acceptable for a page the user typically
  // opens, views, and closes within one session.
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
      const isPast = d.getTime() + 86400000 <= new Date().setHours(0, 0, 0, 0); // day ended
      const isFuture = new Date(key).setHours(0, 0, 0, 0) > new Date().setHours(0, 0, 0, 0);
      return {
        date: d,
        key,
        label: WEEKDAY_LABELS[i],
        weekday: i,
        work: dayWork,
        pause: dayPause,
        target,
        saldo: dayWork - target,
        isToday,
        isPast,
        isFuture,
      };
    });
  }, [weekDays, workEntries, pauseEntries, dailyTargets, todayKey]);

  const weekWorkTotal = weekDayStats.reduce((s, d) => s + d.work, 0);
  const weekPauseTotal = weekDayStats.reduce((s, d) => s + d.pause, 0);

  // "Saldo to date": actual minus target for days that have fully passed.
  // Today counts proportionally based on wall-clock progress through today's schedule window.
  const weekTargetToDate = useMemo(() => {
    if (!isCurrentWeek) {
      // For past weeks, grade the whole week. For future weeks, nothing is owed yet.
      return weekOffset < 0 ? weekTargetMinutes : 0;
    }
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
          else {
            const span = Math.max(1, endMin - startMin);
            total += Math.round(d.target * ((nowMin - startMin) / span));
          }
        } else if (d.target > 0) {
          // No Von–Bis set, approximate linearly via 09:00–17:00 window.
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const frac = Math.min(1, Math.max(0, (nowMin - 9 * 60) / (8 * 60)));
          total += Math.round(d.target * frac);
        }
      }
    });
    return total;
  }, [weekDayStats, schedule, weekTargetMinutes, isCurrentWeek, weekOffset, now]);

  const weekSaldo = weekWorkTotal - weekTargetToDate;

  // Catch-up hours: full-week target minus actual (only if behind).
  const weekCatchUp = Math.max(0, weekTargetMinutes - weekWorkTotal);

  // Forecast: assume remaining weekdays hit their pensum exactly.
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
    const projected = actualPastAndToday + Math.max(0, dailyTargets.get(currentIsoWeekday) ?? 0) - Math.max(0, weekDayStats[currentIsoWeekday]?.work ?? 0) + futurePensum;
    const projectedAlt = actualPastAndToday + futurePensum + Math.max(0, (dailyTargets.get(currentIsoWeekday) ?? 0) - (weekDayStats[currentIsoWeekday]?.work ?? 0));
    void projectedAlt;
    return {
      projected,
      balance: projected - weekTargetMinutes,
      // Simple "if you hit pensum the rest of the week" is equivalent to the past days' saldo.
      basedOnPastBalance: actualPastAndToday - targetPastAndToday + Math.max(0, (weekDayStats[currentIsoWeekday]?.work ?? 0) - (dailyTargets.get(currentIsoWeekday) ?? 0)),
    };
  }, [isCurrentWeek, hasSchedule, weekDayStats, dailyTargets, currentIsoWeekday, weekTargetMinutes]);

  // ------------------------------------------------------------------
  // MONTH / YEAR AGGREGATES
  // ------------------------------------------------------------------
  const monthRef = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return d;
  }, [monthOffset, now]);

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
  const monthTargetToDate = monthDayStats
    .filter((d) => d.isPast || d.isToday)
    .reduce((s, d) => s + d.target, 0);
  const monthSaldo = monthWorkTotal - monthTargetToDate;

  const yearRef = useMemo(() => new Date(now.getFullYear() + yearOffset, 0, 1), [yearOffset, now]);

  const yearMonthStats = useMemo(() => {
    const year = yearRef.getFullYear();
    return Array.from({ length: 12 }, (_, m) => {
      const monthStart = new Date(year, m, 1);
      const monthEnd = new Date(year, m + 1, 0);
      const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
      const work = workEntries
        .filter((e) => e.start_time.startsWith(monthKey))
        .reduce((s, e) => s + e.duration_minutes, 0);
      // Sum day targets across the month by weekday
      let target = 0;
      for (let day = 1; day <= monthEnd.getDate(); day++) {
        target += dailyTargets.get(isoWeekday(new Date(year, m, day))) ?? 0;
      }
      const isPast = monthEnd.getTime() + 86400000 <= new Date().setHours(0, 0, 0, 0);
      const isCurrent = year === now.getFullYear() && m === now.getMonth();
      void monthStart;
      return { monthIndex: m, label: monthStart.toLocaleDateString("de-AT", { month: "short" }), work, target, isPast, isCurrent };
    });
  }, [yearRef, workEntries, dailyTargets, now]);

  const yearWorkTotal = yearMonthStats.reduce((s, m) => s + m.work, 0);
  const yearTargetToDate = yearMonthStats
    .filter((m) => m.isPast || m.isCurrent)
    .reduce((s, m) => {
      if (m.isPast) return s + m.target;
      // Current month: prorate by monthDayStats we already computed for "today's year"?
      if (m.isCurrent && yearOffset === 0) return s + monthTargetToDate;
      return s;
    }, 0);
  const yearSaldo = yearWorkTotal - yearTargetToDate;

  // ------------------------------------------------------------------
  // DAILY DETAIL (Tagesdetail-Karte unter dem Chart)
  // ------------------------------------------------------------------
  const selectedDay = useMemo(() => {
    const key = selectedDayKey ?? (isCurrentWeek ? todayKey : dateKey(weekDays[0]));
    const idx = weekDayStats.findIndex((d) => d.key === key);
    return weekDayStats[idx >= 0 ? idx : 0];
  }, [selectedDayKey, weekDayStats, isCurrentWeek, todayKey, weekDays]);

  // ------------------------------------------------------------------
  // PROJECT BREAKDOWN (period-aware)
  // ------------------------------------------------------------------
  const periodEntries = useMemo(() => {
    if (period === "week") {
      const first = dateKey(weekDays[0]);
      const last = dateKey(weekDays[6]);
      return workEntries.filter((e) => {
        const k = e.start_time.split("T")[0];
        return k >= first && k <= last;
      });
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

  if (loading) {
    return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;
  }

  // Chart scaling: bar heights anchored to target-or-max so the target line always sits at a sensible location.
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
  const gotoNow = () => {
    setWeekOffset(0);
    setMonthOffset(0);
    setYearOffset(0);
    setSelectedDayKey(null);
  };

  const saldoForPeriod = period === "week" ? weekSaldo : period === "month" ? monthSaldo : yearSaldo;
  const workForPeriod = period === "week" ? weekWorkTotal : period === "month" ? monthWorkTotal : yearWorkTotal;
  const targetToDateForPeriod = period === "week" ? weekTargetToDate : period === "month" ? monthTargetToDate : yearTargetToDate;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <Link href="/time" className="text-sm text-gray-500 hover:text-[var(--text-secondary)] transition">&larr; {t("time.backToTime")}</Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("time.analyticsTitle")}</h1>
        </div>
        <div className="flex gap-0.5 px-0.5 pb-1 border-b border-[var(--border)]">
          {(["week", "month", "year"] as const).map((p) => (
            <TabButton key={p} active={period === p} onClick={() => setPeriod(p)}>
              {p === "week" ? t("common.week") : p === "month" ? t("common.month") : t("common.year")}
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
            <button onClick={gotoNow} className="text-[10px] text-[var(--brand-orange)] hover:underline">{t("time.backToToday")}</button>
          )}
          {period === "month" && monthOffset !== 0 && (
            <button onClick={gotoNow} className="text-[10px] text-[var(--brand-orange)] hover:underline">{t("time.backToToday")}</button>
          )}
          {period === "year" && yearOffset !== 0 && (
            <button onClick={gotoNow} className="text-[10px] text-[var(--brand-orange)] hover:underline">{t("time.backToToday")}</button>
          )}
        </div>
        <button onClick={gotoNext} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm px-2 py-1 rounded hover:bg-[var(--surface-hover)] transition" title="Weiter">&rarr;</button>
      </div>

      {/* Top summary cards: Stunden gesamt + Saldo + (period-specific extras) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">{t("time.hoursTotal")}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{formatDuration(workForPeriod)}</p>
          {hasSchedule && (
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t("time.targetSoFar")} {formatDuration(targetToDateForPeriod)}</p>
          )}
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
          <p className="text-xs text-[var(--text-muted)]">{t("time.saldo")}</p>
          {hasSchedule ? (
            <p className={`text-2xl font-bold ${saldoForPeriod >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatSaldo(saldoForPeriod)}
            </p>
          ) : (
            <p className="text-sm text-[var(--text-muted)] italic">{t("time.noSchedule")}</p>
          )}
          {hasSchedule && (
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t("time.vsTargetToday")}</p>
          )}
        </div>
        {period === "week" && hasSchedule && (
          <>
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--text-muted)]">{t("time.catchUp")}</p>
              <p className={`text-2xl font-bold ${weekCatchUp > 0 ? "text-[var(--brand-orange)]" : "text-emerald-400"}`}>
                {weekCatchUp > 0 ? formatDuration(weekCatchUp) : "0h"}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {weekCatchUp > 0 ? t("time.untilWeekTarget", { target: formatDuration(weekTargetMinutes) }) : t("time.weekTargetReached")}
              </p>
            </div>
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--text-muted)]">{t("time.forecastWeekSaldo")}</p>
              {weekForecast ? (
                <p className={`text-2xl font-bold ${weekForecast.balance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {formatSaldo(weekForecast.balance)}
                </p>
              ) : (
                <p className="text-sm text-[var(--text-muted)] italic">—</p>
              )}
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t("time.atPensumForRemaining")}</p>
            </div>
          </>
        )}
        {period !== "week" && (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs text-[var(--text-muted)]">{t("time.billable")}</p>
            <p className="text-2xl font-bold text-emerald-400">{formatDuration(billableMinutes)}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {periodWorkTotal > 0 ? Math.round(billableMinutes / periodWorkTotal * 100) : 0}% {t("time.ofHours")}
            </p>
          </div>
        )}
        {period !== "week" && (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs text-[var(--text-muted)]">{t("time.projects")}</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{projectTotals.length}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{t("time.inPeriod")}</p>
          </div>
        )}
      </div>

      {period === "week" && (
        <>
          {/* Week chart with target indicator */}
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("time.weekChart")}</h2>
              {weekPauseTotal > 0 && (
                <span className="text-[10px] text-amber-400/80">+ {formatDuration(weekPauseTotal)} {t("time.pause")}</span>
              )}
            </div>
            <div className="flex items-end gap-2 h-52 relative pt-6">
              {weekDayStats.map((day) => {
                const barHeight = Math.max(2, (day.work / maxDailyForChart) * 180);
                const targetHeight = day.target > 0 ? (day.target / maxDailyForChart) * 180 : 0;
                const overPart = day.work > day.target && day.target > 0
                  ? ((day.work - day.target) / maxDailyForChart) * 180
                  : 0;
                const underPart = Math.max(0, barHeight - overPart);
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
                      {/* target tick */}
                      {day.target > 0 && (
                        <div
                          className="absolute left-0 right-0 border-t-2 border-dashed border-[var(--text-muted)]/60 z-10"
                          style={{ bottom: `${targetHeight}px` }}
                        >
                          <span className="absolute -top-4 right-0 text-[9px] text-[var(--text-muted)]">
                            {formatDuration(day.target)}
                          </span>
                        </div>
                      )}
                      {/* bar */}
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          selected ? "ring-2 ring-[var(--brand-orange)] ring-offset-1 ring-offset-[var(--surface)]" : ""
                        }`}
                        style={{
                          height: `${underPart}px`,
                          backgroundColor: day.isToday ? "var(--brand-orange)" : day.target > 0 && day.work >= day.target ? "#10b981" : "#3b82f6",
                          opacity: 0.85,
                        }}
                      />
                      {overPart > 0 && (
                        <div
                          className="w-full"
                          style={{ height: `${overPart}px`, backgroundColor: "#f59e0b", borderRadius: "0.375rem 0.375rem 0 0" }}
                          title={t("time.overTarget")}
                        />
                      )}
                    </div>
                    <span className={`text-[10px] ${day.isToday ? "text-[var(--brand-orange)] font-semibold" : "text-[var(--text-muted)]"}`}>
                      {day.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {hasSchedule && (
              <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#3b82f6" }} />{t("time.belowTarget")}</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#10b981" }} />{t("time.targetReached")}</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#f59e0b" }} />{t("time.aboveTarget")}</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "var(--brand-orange)" }} />{t("time.todayLabel")}</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-[2px] bg-[var(--text-muted)]/60" style={{ borderTop: "2px dashed" }} />{t("time.dailyTarget")}</span>
              </div>
            )}
          </div>

          {/* Day detail card */}
          {selectedDay && (
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)] tracking-wide">{t("time.dayDetail")}</p>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    {selectedDay.date.toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "long" })}
                    {selectedDay.isToday && <span className="text-[var(--brand-orange)] ml-2">· {t("time.todayLabel")}</span>}
                  </h2>
                </div>
                {!isCurrentWeek || !selectedDay.isToday ? null : (
                  <Link href="/time" className="text-[10px] text-[var(--brand-orange)] hover:underline">{t("time.toTimeTracking")} &rarr;</Link>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-[var(--text-muted)]">{t("time.dayTotal")}</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{formatDuration(selectedDay.work + selectedDay.pause)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-muted)]">{t("time.dayWork")}</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{formatDuration(selectedDay.work)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-muted)]">{t("time.saldo")}</p>
                  {selectedDay.target > 0 ? (
                    <p className={`text-lg font-bold ${selectedDay.saldo >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {formatSaldo(selectedDay.saldo)}
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] italic">{t("time.noTarget")}</p>
                  )}
                  {selectedDay.target > 0 && (
                    <p className="text-[10px] text-[var(--text-muted)]">{t("time.targetLabel")} {formatDuration(selectedDay.target)}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-muted)]">{t("time.dayPause")}</p>
                  <p className="text-lg font-bold text-amber-400">{selectedDay.pause > 0 ? formatDuration(selectedDay.pause) : "—"}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {period === "month" && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">{t("time.monthOverview")}</h2>
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

      {period === "year" && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">{t("time.yearOverview")}</h2>
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

      {/* Project pie + billable breakdown — always shown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">{t("time.projects")}</h2>
          {projectTotals.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">{t("time.noEntriesInPeriod")}</p>
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
                <text x="60" y="70" textAnchor="middle" className="text-[9px]" fill="var(--text-muted)">{t("common.total")}</text>
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
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">{t("time.billableVsInternal")}</h2>
          {periodWorkTotal === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">{t("time.noEntriesInPeriod")}</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex-1 h-6 bg-[var(--border)] rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(billableMinutes / periodWorkTotal) * 100}%` }} />
                <div className="h-full bg-gray-500 transition-all" style={{ width: `${(nonBillableMinutes / periodWorkTotal) * 100}%` }} />
              </div>
              <div className="flex flex-col gap-1 text-xs shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-[var(--text-secondary)]">{t("time.billableLabel")} {Math.round(billableMinutes / periodWorkTotal * 100)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                  <span className="text-[var(--text-secondary)]">{t("time.internalLabel")} {Math.round(nonBillableMinutes / periodWorkTotal * 100)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!hasSchedule && (
        <div className="bg-[var(--brand-orange-dim)] border border-[var(--brand-orange)]/40 rounded-xl p-4 text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--brand-orange)]">{t("common.hint")}</strong> {t("time.scheduleHintBefore")}<Link href="/admin" className="underline hover:text-[var(--text-primary)]">{t("time.scheduleHintLink")}</Link>{t("time.scheduleHintAfter")}
        </div>
      )}
    </div>
  );
}
