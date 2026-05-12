// SCH-2088 — Pure surcharge engine.
// Deterministic, side-effect-free, unit-testable. Consumed by:
//   - createTimeEntry / updateTimeEntry in lib/db.ts (save-hook)
//   - scripts/backfill-time-entry-surcharges.ts (one-shot fill)
//   - tests/unit/surcharge.test.ts
//
// Algorithm (per minute, then aggregated into 4 buckets):
//   1. Split the entry at midnight so each calendar day uses its own
//      daily_target_minutes and "Stunde des Arbeitstags" counter.
//   2. For every minute of every segment, collect the applicable rules:
//        - Hour-of-workday OT (Mo–Fr beyond target, +50 % / +100 %)
//        - Weekday rules (Sa base/no-swap, Su base/Mehrarbeit)
//        - Night-window rules (00:00–06:00 base/OT)
//   3. Combine the per-minute percentages via the policy (default: max).
//   4. Bucket each minute into base / 25 / 50 / 100.
//   5. Subtract unpaid_break_minutes from the most expensive bucket first.

import {
  CalculateSurchargesOptions,
  CombinationPolicy,
  SurchargeBreakdown,
  SurchargeEntryInput,
  SurchargeModel,
  SurchargeRule,
  WeekdayIndex,
} from "./types";

const MINUTES_PER_DAY = 24 * 60;
const NIGHT_END_MIN = 6 * 60;
// "9.+10. Stunde des Arbeitstags" = 120 minutes after the daily target.
const OT_50_WINDOW_MIN = 2 * 60;

// Parse "YYYY-MM-DDTHH:MM[:SS][Z]" → { dayKey, minuteOfDay } interpreted as
// wall-clock local time. We deliberately ignore any Z/timezone suffix so the
// engine can run anywhere without an Intl/timezone dependency; callers are
// expected to feed local times (this matches how the time-tracking UI stores
// start_time/end_time in the DB — naive local from new Date().toISOString()
// after the user's clock).
function parseLocal(value: string): { dayKey: string; minuteOfDay: number } {
  const trimmed = value.endsWith("Z") ? value.slice(0, -1) : value;
  const [datePart, timePart = "00:00"] = trimmed.split("T");
  const [hhStr, mmStr] = timePart.split(":");
  const hh = Number(hhStr);
  const mm = Number(mmStr);
  if (!datePart || !Number.isFinite(hh) || !Number.isFinite(mm)) {
    throw new Error(`calculateSurcharges: invalid local datetime "${value}"`);
  }
  return { dayKey: datePart, minuteOfDay: hh * 60 + mm };
}

function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function diffDays(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

// 0=Mon … 6=Sun (ISO), matching the rest of the repo. Uses UTC so the
// computation is timezone-independent.
function isoWeekdayOf(dayKey: string): WeekdayIndex {
  const [y, m, d] = dayKey.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const iso = js === 0 ? 6 : js - 1;
  return iso as WeekdayIndex;
}

interface Segment {
  dayKey: string;
  weekday: WeekdayIndex;
  startMin: number;       // inclusive
  endMin: number;         // exclusive
  targetMin: number;      // daily_target_minutes for this weekday
  saturdayNoSwap: boolean;
}

// Surcharge percentages for the four buckets.
const PCT_BASE = 0;
const PCT_25 = 25;
const PCT_50 = 50;
const PCT_100 = 100;

interface RuleHit {
  rule: SurchargeRule;
  pct: number;
}

// Determine all rules that apply to a single minute.
//
// Inputs:
//   - segment context (weekday, target, saturdayNoSwap)
//   - minuteOfDay (00:00..23:59 == 0..1439)
//   - workedMinutesInDay: how many minutes of the day-segment have already
//     been counted before this one (drives "Stunde des Arbeitstags" OT).
function rulesForMinute(
  seg: Segment,
  minuteOfDay: number,
  workedMinutesInDay: number,
): RuleHit[] {
  const hits: RuleHit[] = [];
  const isNight = minuteOfDay < NIGHT_END_MIN;
  const isOTSlot = workedMinutesInDay >= seg.targetMin;
  const otOffset = workedMinutesInDay - seg.targetMin; // negative when not OT yet

  switch (seg.weekday) {
    case 0: case 1: case 2: case 3: case 4: {
      // Mo–Fr
      if (isOTSlot) {
        if (otOffset < OT_50_WINDOW_MIN) {
          hits.push({ rule: "OT_HOUR_9_10", pct: PCT_50 });
        } else {
          hits.push({ rule: "OT_HOUR_11_PLUS", pct: PCT_100 });
        }
      } else {
        hits.push({ rule: "BASE", pct: PCT_BASE });
      }
      break;
    }
    case 5: {
      // Saturday
      if (seg.saturdayNoSwap) {
        hits.push({ rule: "SATURDAY_NO_SWAP", pct: PCT_100 });
      } else if (isOTSlot) {
        if (otOffset < OT_50_WINDOW_MIN) {
          hits.push({ rule: "SATURDAY_OT_9_10", pct: PCT_50 });
        } else {
          hits.push({ rule: "SATURDAY_OT_11_PLUS", pct: PCT_100 });
        }
      } else {
        hits.push({ rule: "SATURDAY_BASE", pct: PCT_25 });
      }
      break;
    }
    case 6: {
      // Sunday
      if (isOTSlot) {
        hits.push({ rule: "SUNDAY_OVERTIME", pct: PCT_100 });
      } else {
        hits.push({ rule: "SUNDAY_BASE", pct: PCT_25 });
      }
      break;
    }
  }

  if (isNight) {
    hits.push({
      rule: isOTSlot ? "NIGHT_OVERTIME" : "NIGHT_BASE",
      pct: isOTSlot ? PCT_100 : PCT_50,
    });
  }

  return hits;
}

// Map a chosen percentage to the breakdown bucket. Anything we can't represent
// in the four-bucket schema (e.g. sum=125 in `sum` policy) clamps to the
// nearest legal bucket — the full per-rule detail is preserved separately in
// rules_applied so payroll can still reconstruct exact factors.
function pctToBucket(pct: number): "base" | "p25" | "p50" | "p100" {
  if (pct <= 0) return "base";
  if (pct <= 25) return "p25";
  if (pct <= 50) return "p50";
  return "p100";
}

// Combine multiple rule hits into a single bucket assignment. rules_applied
// always reflects every factually-applicable rule for the minute (both in
// `max` and `sum` policies) so payroll can audit which surcharges *could*
// have applied, even when only the highest one drove the bucket.
function pickBucket(
  hits: RuleHit[],
  policy: CombinationPolicy,
): { bucket: "base" | "p25" | "p50" | "p100"; rules: SurchargeRule[] } {
  if (hits.length === 0) {
    return { bucket: "base", rules: ["BASE"] };
  }
  const allRules = hits.map((h) => h.rule);
  if (policy === "sum") {
    const total = hits.reduce((acc, h) => acc + h.pct, 0);
    return { bucket: pctToBucket(total), rules: allRules };
  }
  // max policy
  let bestPct = hits[0].pct;
  for (const h of hits) {
    if (h.pct > bestPct) bestPct = h.pct;
  }
  return { bucket: pctToBucket(bestPct), rules: allRules };
}

function calcSegment(
  seg: Segment,
  policy: CombinationPolicy,
): { buckets: Record<"base" | "p25" | "p50" | "p100", number>; rules: Set<SurchargeRule> } {
  const buckets = { base: 0, p25: 0, p50: 0, p100: 0 };
  const rules = new Set<SurchargeRule>();

  // Per-minute iteration. Each entry-segment is at most 1440 minutes — cheap.
  let workedBefore = 0;
  for (let m = seg.startMin; m < seg.endMin; m++) {
    const hits = rulesForMinute(seg, m, workedBefore);
    const { bucket, rules: chosenRules } = pickBucket(hits, policy);
    buckets[bucket] += 1;
    for (const r of chosenRules) {
      if (r !== "BASE") rules.add(r);
    }
    workedBefore += 1;
  }

  return { buckets, rules };
}

// Subtract `pauseMinutes` from the most expensive bucket first. Returns a
// fresh buckets object — input is not mutated.
function applyPause(
  buckets: Record<"base" | "p25" | "p50" | "p100", number>,
  pauseMinutes: number,
): Record<"base" | "p25" | "p50" | "p100", number> {
  const out = { ...buckets };
  let remaining = Math.max(0, Math.floor(pauseMinutes));
  for (const key of ["p100", "p50", "p25", "base"] as const) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, out[key]);
    out[key] -= take;
    remaining -= take;
  }
  return out;
}

function buildSegments(
  startKey: string, startMin: number,
  endKey: string, endMin: number,
  model: SurchargeModel,
  saturdayNoSwapOverride: boolean | undefined,
): Segment[] {
  const days = diffDays(startKey, endKey);
  if (days < 0 || (days === 0 && endMin <= startMin)) {
    return [];
  }
  const saturdayNoSwapDefault = model.saturday_no_swap_agreement_default ?? false;
  const noSwap = saturdayNoSwapOverride ?? saturdayNoSwapDefault;
  const segments: Segment[] = [];
  for (let i = 0; i <= days; i++) {
    const dayKey = addDays(startKey, i);
    const weekday = isoWeekdayOf(dayKey);
    const segStart = i === 0 ? startMin : 0;
    const segEnd = i === days ? endMin : MINUTES_PER_DAY;
    if (segEnd <= segStart) continue;
    segments.push({
      dayKey,
      weekday,
      startMin: segStart,
      endMin: segEnd,
      targetMin: model.daily_target_minutes[weekday] ?? 0,
      saturdayNoSwap: noSwap,
    });
  }
  return segments;
}

// Stable order for rules_applied so persisted JSON is deterministic and
// tests don't flake on Set iteration order. Matches the natural narrative
// order: workday → weekend → night.
const RULE_ORDER: SurchargeRule[] = [
  "OT_HOUR_9_10",
  "OT_HOUR_11_PLUS",
  "SATURDAY_BASE",
  "SATURDAY_OT_9_10",
  "SATURDAY_OT_11_PLUS",
  "SATURDAY_NO_SWAP",
  "SUNDAY_BASE",
  "SUNDAY_OVERTIME",
  "NIGHT_BASE",
  "NIGHT_OVERTIME",
  "BASE",
];

export function calculateSurcharges(
  entry: SurchargeEntryInput,
  model: SurchargeModel,
  options: CalculateSurchargesOptions = {},
): SurchargeBreakdown {
  const policy: CombinationPolicy = options.combination ?? "max";
  const start = parseLocal(entry.start_local);
  const end = parseLocal(entry.end_local);

  const segments = buildSegments(
    start.dayKey, start.minuteOfDay,
    end.dayKey, end.minuteOfDay,
    model,
    entry.saturday_no_swap_agreement,
  );

  const totals = { base: 0, p25: 0, p50: 0, p100: 0 };
  const rules = new Set<SurchargeRule>();
  for (const seg of segments) {
    const out = calcSegment(seg, policy);
    totals.base += out.buckets.base;
    totals.p25 += out.buckets.p25;
    totals.p50 += out.buckets.p50;
    totals.p100 += out.buckets.p100;
    for (const r of out.rules) rules.add(r);
  }

  const pause = entry.unpaid_break_minutes ?? 0;
  const afterPause = applyPause(totals, pause);
  const orderedRules = RULE_ORDER.filter((r) => rules.has(r));

  return {
    base_minutes: afterPause.base,
    ot_25_minutes: afterPause.p25,
    ot_50_minutes: afterPause.p50,
    ot_100_minutes: afterPause.p100,
    rules_applied: orderedRules,
  };
}
