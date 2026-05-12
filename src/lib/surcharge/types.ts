// SCH-2088 — Pure types for the surcharge engine.
// Kept dependency-free so the engine can run client-side, in API routes, in
// the backfill script, and in unit tests without pulling in Supabase, React,
// or any other framework code.

// Weekday encoding: 0 = Mon … 6 = Sun (ISO-style, matches the rest of the
// repo — see WEEKDAY_LABELS in lib/types.ts).
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Single rule label that ended up applied to at least one minute of the
// breakdown. Stable strings so downstream UI / payroll can render them.
export type SurchargeRule =
  | "BASE"
  | "OT_HOUR_9_10"          // Mo–Fr 9.+10. Stunde des Arbeitstags
  | "OT_HOUR_11_PLUS"       // Mo–Fr ab 11. Stunde
  | "SATURDAY_BASE"         // Sa Normalstunden +25 %
  | "SATURDAY_OT_9_10"      // Sa 9.+10. Stunde +50 %
  | "SATURDAY_OT_11_PLUS"   // Sa ab 11. Stunde +100 %
  | "SATURDAY_NO_SWAP"      // Sa ohne Tauschvereinbarung +100 % auf alles
  | "SUNDAY_BASE"           // So Normalstunden +25 %
  | "SUNDAY_OVERTIME"       // So Mehrarbeit (>Soll) +100 %
  | "NIGHT_BASE"            // 00–06 Uhr Normalarbeit +50 %
  | "NIGHT_OVERTIME";       // 00–06 Uhr während OT +100 %

// Input describing the entry the user wants to save. Times use the
// naive-local-time convention used throughout the time-tracking UI
// (`YYYY-MM-DDTHH:MM` — no timezone suffix). The engine works in
// minute-resolution; seconds in the input are floored.
export interface SurchargeEntryInput {
  // ISO-like local datetime, e.g. "2026-05-11T09:00". Either naive
  // ("YYYY-MM-DDTHH:MM[:SS]") or a full ISO Z-string is accepted; if Z is
  // present it is interpreted as wall-clock minutes since the user's local
  // perspective is what the surcharge rules reference.
  start_local: string;
  end_local: string;
  // Subtracted from the most expensive bucket before assigning rules to
  // base/25/50/100. Defaults to 0.
  unpaid_break_minutes?: number;
  // Per-entry override of the model-level flag. Undefined = use model default.
  saturday_no_swap_agreement?: boolean;
}

// Per-weekday target source — read from `work_time_models` (after SCH-2087)
// or from `user_work_schedules` today.
export interface SurchargeModel {
  // Map from WeekdayIndex (0..6) → daily target in minutes. Missing weekday
  // means daily_target_minutes = 0 (rest day; everything counts as Mehrarbeit).
  daily_target_minutes: Partial<Record<WeekdayIndex, number>>;
  // Model-level default for the Saturday "no swap agreement" flag.
  saturday_no_swap_agreement_default?: boolean;
}

export interface SurchargeBreakdown {
  base_minutes: number;
  ot_25_minutes: number;
  ot_50_minutes: number;
  ot_100_minutes: number;
  rules_applied: SurchargeRule[];
}

// Combination policy when multiple surcharge percentages apply to the same
// minute. AT-KV practice is "höherer Zuschlag schlägt", which is the default.
// `sum` is exposed so the board can flip default per request_confirmation
// without a code change.
export type CombinationPolicy = "max" | "sum";

export interface CalculateSurchargesOptions {
  combination?: CombinationPolicy;
}
