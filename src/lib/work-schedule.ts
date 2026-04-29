// Pure helpers for the per-user weekly work schedule introduced in SCH-369.
// Kept dependency-free so they can run server-side, in API routes, or in
// Node-based reports without pulling in any React/Supabase code.

import { UserWorkSchedule } from "./types";

export type WeekdayTargetMap = Map<number, number>;

// Map JS getDay() (0=Sun, 1=Mon, …, 6=Sat) to ISO weekday (0=Mon, 6=Sun).
export function isoWeekday(date: Date): number {
  const js = date.getDay();
  return js === 0 ? 6 : js - 1;
}

export function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - isoWeekday(d));
  return d;
}

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildDailyTargetMap(schedules: UserWorkSchedule[]): WeekdayTargetMap {
  const map: WeekdayTargetMap = new Map();
  schedules.forEach((s) => {
    if (s.weekday >= 0 && s.weekday <= 6) {
      map.set(s.weekday, Math.max(0, s.daily_target_minutes));
    }
  });
  return map;
}

export function weeklyTargetMinutes(map: WeekdayTargetMap): number {
  let total = 0;
  for (let i = 0; i < 7; i++) total += map.get(i) ?? 0;
  return total;
}

// Parse a "HH:MM" or "HH:MM:SS" time string to minutes-since-midnight, or null.
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hh, mm] = value.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

// How much of `row.daily_target_minutes` should already be earned by the wall
// clock time `nowMinutes` on the row's weekday?
//
// - If the row has a Von–Bis window: linear progress between start and end.
// - If only a target is set (no times): default to a 09:00–17:00 window so the
//   "today so far" Saldo card still shows something useful. This matches the
//   fallback the analytics page used inline before extraction.
//
// Returns 0 before start, full target after end, proportional in between.
export function proportionalDailyTarget(
  row: { start_time: string | null; end_time: string | null; daily_target_minutes: number },
  nowMinutes: number
): number {
  const target = Math.max(0, row.daily_target_minutes);
  if (target === 0) return 0;

  const start = parseTimeToMinutes(row.start_time);
  const end = parseTimeToMinutes(row.end_time);

  // No window — fall back to 09:00–17:00.
  if (start === null || end === null || end <= start) {
    const fallbackStart = 9 * 60;
    const fallbackEnd = 17 * 60;
    if (nowMinutes <= fallbackStart) return 0;
    if (nowMinutes >= fallbackEnd) return target;
    return Math.round(target * ((nowMinutes - fallbackStart) / (fallbackEnd - fallbackStart)));
  }

  if (nowMinutes <= start) return 0;
  if (nowMinutes >= end) return target;
  return Math.round(target * ((nowMinutes - start) / (end - start)));
}

export interface WeekTargetToDateInput {
  weekStart: Date; // Monday 00:00 of the reference week
  schedules: UserWorkSchedule[];
  now: Date; // current time (pinned per-render is fine)
}

// Sum of pensum the user "should have worked" by `now`:
// - past days contribute their full target,
// - today contributes a proportional slice based on its Von–Bis window,
// - future days contribute 0.
//
// For a fully past week (now is after Sunday), every day contributes its
// target. For a fully future week (now is before Monday), the result is 0.
export function weekTargetToDate(input: WeekTargetToDateInput): number {
  const { weekStart, schedules, now } = input;
  const map = buildDailyTargetMap(schedules);
  const todayKey = dateKey(now);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  let total = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const target = map.get(i) ?? 0;
    if (target === 0) continue;

    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);

    if (dayKey(day) === todayKey) {
      const row = schedules.find((s) => s.weekday === i) ?? {
        start_time: null,
        end_time: null,
        daily_target_minutes: target,
      };
      total += proportionalDailyTarget(row, now.getHours() * 60 + now.getMinutes());
    } else if (dayStart.getTime() < startOfToday.getTime()) {
      total += target;
    }
    // future day → 0
  }
  return total;
}

// Tiny alias used internally to make the comparison above easy to read.
function dayKey(date: Date): string { return dateKey(date); }

export interface WeekForecastInput {
  schedules: UserWorkSchedule[];
  /** Per-weekday actual minutes worked (Mon=0 … Sun=6). */
  workedByWeekday: number[];
  now: Date;
}

export interface WeekForecast {
  /** Projected total minutes by Sunday-night if remaining days hit pensum. */
  projectedMinutes: number;
  /** projectedMinutes minus the full weekly target. Positive = surplus. */
  balanceMinutes: number;
}

// Project the end-of-week balance assuming the user hits their pensum on
// every day that hasn't fully passed yet. Today is treated as: keep the
// minutes already worked AND fill the rest of today up to today's pensum
// (whichever is greater between actual-so-far and full pensum).
export function weekForecast(input: WeekForecastInput): WeekForecast {
  const { schedules, workedByWeekday, now } = input;
  const map = buildDailyTargetMap(schedules);
  const todayIso = isoWeekday(now);

  let projected = 0;
  for (let i = 0; i < 7; i++) {
    const target = map.get(i) ?? 0;
    const worked = workedByWeekday[i] ?? 0;
    if (i < todayIso) {
      // Fully past — count what was actually worked, not the target.
      projected += worked;
    } else if (i === todayIso) {
      // Today — assume the user finishes their pensum (if currently below).
      projected += Math.max(worked, target);
    } else {
      // Future — assume pensum is hit.
      projected += target;
    }
  }

  return {
    projectedMinutes: projected,
    balanceMinutes: projected - weeklyTargetMinutes(map),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ScheduleRowInput {
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  daily_target_minutes: number;
  // SCH-918 K2-G10 — optional on input; CHECK >= 0 enforced by DB.
  unpaid_break_minutes?: number;
}

export type ScheduleValidationError =
  | "negative_break"
  | "weekday_out_of_range"
  | "negative_target"
  | "end_before_or_equal_start"
  | "missing_one_time";

// Returns a list of errors. Empty list = valid.
//
// Rules mirror the DB constraints in v1+v2 of the migration:
//   - weekday in [0,6]
//   - daily_target_minutes >= 0
//   - if both times set, end must be strictly later than start
//   - if only one time is set, that's allowed at the DB level but is almost
//     always a UI mistake — surface a warning so callers can choose to clear
//     the orphan field before persisting.
export function validateScheduleRow(row: ScheduleRowInput): ScheduleValidationError[] {
  const errors: ScheduleValidationError[] = [];
  if (row.weekday < 0 || row.weekday > 6 || !Number.isInteger(row.weekday)) {
    errors.push("weekday_out_of_range");
  }
  if (!Number.isFinite(row.daily_target_minutes) || row.daily_target_minutes < 0) {
    errors.push("negative_target");
  }
  const start = parseTimeToMinutes(row.start_time);
  const end = parseTimeToMinutes(row.end_time);
  if (start !== null && end !== null && end <= start) {
    errors.push("end_before_or_equal_start");
  }
  if ((start === null) !== (end === null)) {
    errors.push("missing_one_time");
  }
  if (
    row.unpaid_break_minutes !== undefined &&
    (!Number.isFinite(row.unpaid_break_minutes) || row.unpaid_break_minutes < 0)
  ) {
    errors.push("negative_break");
  }
  return errors;
}

// True when the row is effectively a "rest day" — no times, no target. The
// admin UI represents these as disabled rows; callers should delete them
// instead of upserting a 0-minute row that adds noise to the table.
export function isEmptyRow(row: ScheduleRowInput): boolean {
  return (
    row.daily_target_minutes === 0 &&
    !row.start_time &&
    !row.end_time
  );
}
