// SCH-2088 — Save-hook adapter that turns a TimeEntry row's UTC fields into
// the engine's `SurchargeEntryInput`/`SurchargeModel` pair, runs the pure
// engine, and returns the column values to persist alongside the row.
//
// Today the model is loaded from `user_work_schedules` (per-user, per-weekday
// pensum). After SCH-2087 lands, the lookup switches to
// `user_profiles.work_time_model_id → work_time_models / work_time_model_days`
// — the engine signature does not change.

import { calculateSurcharges } from "./engine";
import {
  CalculateSurchargesOptions,
  SurchargeBreakdown,
  SurchargeModel,
  WeekdayIndex,
} from "./types";

// Engine version stamp embedded into the persisted JSONB so payroll / audits
// can tell which algorithm produced a given row. Bump when the engine output
// semantics change.
export const SURCHARGE_ENGINE_VERSION = "1.0.0";

// Timezone the surcharge rules reference (AT-KV). Hard-coded for Orange Octo;
// can be lifted to company_settings later if the app expands beyond AT.
const RULES_TIMEZONE = "Europe/Vienna";

interface WorkScheduleRow {
  weekday: number;
  daily_target_minutes: number;
  unpaid_break_minutes: number;
}

export interface SurchargeColumns {
  surcharge_breakdown: SurchargeBreakdownJson;
  base_minutes: number;
  ot_25_minutes: number;
  ot_50_minutes: number;
  ot_100_minutes: number;
}

export interface SurchargeBreakdownJson extends SurchargeBreakdown {
  policy: "max" | "sum";
  engine_version: string;
  computed_at: string;       // ISO UTC
  inputs: {
    start_local: string;
    end_local: string;
    unpaid_break_minutes: number;
    saturday_no_swap_agreement: boolean;
    daily_target_minutes: number;
  };
}

// Convert a UTC ISO timestamp to a naive local-time string in the rules
// timezone — "YYYY-MM-DDTHH:MM". Uses Intl.DateTimeFormat so this works
// uniformly in browser + Node without a date library.
export function toRulesLocal(isoUtc: string): string {
  const dt = new Date(isoUtc);
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`toRulesLocal: invalid ISO "${isoUtc}"`);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RULES_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(dt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Intl returns "24" for midnight in some locales — normalize to "00".
  const hh = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hh}:${get("minute")}`;
}

export function buildModelFromSchedules(rows: WorkScheduleRow[]): SurchargeModel {
  const daily: Partial<Record<WeekdayIndex, number>> = {};
  for (const r of rows) {
    if (r.weekday >= 0 && r.weekday <= 6) {
      daily[r.weekday as WeekdayIndex] = Math.max(0, r.daily_target_minutes);
    }
  }
  return { daily_target_minutes: daily };
}

// Resolve the unpaid-break minutes for a given entry's weekday. Falls back to
// 0 when the user has no schedule row for that weekday (rest day).
export function breakMinutesForDay(rows: WorkScheduleRow[], weekday: number): number {
  const match = rows.find((r) => r.weekday === weekday);
  return match ? Math.max(0, match.unpaid_break_minutes) : 0;
}

export function computeSurchargeColumns(
  startTimeIsoUtc: string,
  endTimeIsoUtc: string,
  schedules: WorkScheduleRow[],
  options?: CalculateSurchargesOptions & { saturdayNoSwap?: boolean },
): SurchargeColumns {
  const startLocal = toRulesLocal(startTimeIsoUtc);
  const endLocal = toRulesLocal(endTimeIsoUtc);
  const model = buildModelFromSchedules(schedules);
  const startDayKey = startLocal.split("T")[0];
  // Weekday derived from the local-time start date — keep in sync with the
  // engine's own derivation so the break-source matches the bucket the break
  // ultimately deducts from.
  const [y, m, d] = startDayKey.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const isoWeekday = js === 0 ? 6 : js - 1;
  const breakMinutes = breakMinutesForDay(schedules, isoWeekday);
  const dailyTarget = model.daily_target_minutes[isoWeekday as WeekdayIndex] ?? 0;
  const saturdayNoSwap = options?.saturdayNoSwap ?? false;
  const policy = options?.combination ?? "max";

  const breakdown = calculateSurcharges(
    {
      start_local: startLocal,
      end_local: endLocal,
      unpaid_break_minutes: breakMinutes,
      saturday_no_swap_agreement: saturdayNoSwap,
    },
    model,
    { combination: policy },
  );

  return {
    surcharge_breakdown: {
      ...breakdown,
      policy,
      engine_version: SURCHARGE_ENGINE_VERSION,
      computed_at: new Date().toISOString(),
      inputs: {
        start_local: startLocal,
        end_local: endLocal,
        unpaid_break_minutes: breakMinutes,
        saturday_no_swap_agreement: saturdayNoSwap,
        daily_target_minutes: dailyTarget,
      },
    },
    base_minutes: breakdown.base_minutes,
    ot_25_minutes: breakdown.ot_25_minutes,
    ot_50_minutes: breakdown.ot_50_minutes,
    ot_100_minutes: breakdown.ot_100_minutes,
  };
}

// Returns a zero-breakdown record. Used for entries we deliberately don't
// compute (active timers without end_time, pause entries) so columns stay
// non-null and downstream sums remain correct.
export function zeroSurchargeColumns(): SurchargeColumns {
  return {
    surcharge_breakdown: {
      base_minutes: 0,
      ot_25_minutes: 0,
      ot_50_minutes: 0,
      ot_100_minutes: 0,
      rules_applied: [],
      policy: "max",
      engine_version: SURCHARGE_ENGINE_VERSION,
      computed_at: new Date().toISOString(),
      inputs: {
        start_local: "",
        end_local: "",
        unpaid_break_minutes: 0,
        saturday_no_swap_agreement: false,
        daily_target_minutes: 0,
      },
    },
    base_minutes: 0,
    ot_25_minutes: 0,
    ot_50_minutes: 0,
    ot_100_minutes: 0,
  };
}
