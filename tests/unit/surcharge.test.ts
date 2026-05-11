// SCH-2088 — Unit tests for the surcharge engine.
//
// Run:
//   npx tsx tests/unit/surcharge.test.ts
//
// Self-contained — no test framework, just plain assert.strict. Exits with
// non-zero on any failure so CI can wire it in later. The 12+ cases cover
// every branch of the algorithm referenced in the SCH-2088 spec.
//
// Calendar reference (UTC ISO weekday, 0=Mon … 6=Sun):
//   2026-05-11 = Mon   2026-05-12 = Tue
//   2026-05-09 = Sat   2026-05-10 = Sun

import assert from "node:assert/strict";

import {
  calculateSurcharges,
  SurchargeBreakdown,
  SurchargeModel,
} from "../../src/lib/surcharge/index";

const WEEKDAY_TARGET_480: SurchargeModel = {
  daily_target_minutes: { 0: 480, 1: 480, 2: 480, 3: 480, 4: 480, 5: 0, 6: 0 },
};

const SIX_DAY_WEEK: SurchargeModel = {
  daily_target_minutes: { 0: 480, 1: 480, 2: 480, 3: 480, 4: 480, 5: 480, 6: 480 },
};

interface Case {
  name: string;
  run: () => void;
}

function expectBreakdown(actual: SurchargeBreakdown, expected: Partial<SurchargeBreakdown>) {
  for (const key of ["base_minutes", "ot_25_minutes", "ot_50_minutes", "ot_100_minutes"] as const) {
    if (expected[key] !== undefined) {
      assert.equal(actual[key], expected[key], `${key}: expected ${expected[key]}, got ${actual[key]}`);
    }
  }
  if (expected.rules_applied) {
    assert.deepEqual([...actual.rules_applied].sort(), [...expected.rules_applied].sort());
  }
}

const cases: Case[] = [
  {
    name: "Mo 8h normal (09–17, target 480) → 480 base",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-11T09:00", end_local: "2026-05-11T17:00" },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 480, ot_25_minutes: 0, ot_50_minutes: 0, ot_100_minutes: 0,
        rules_applied: [],
      });
    },
  },
  {
    name: "Mo 12h (08–20, target 480) → 480 base + 120 ot_50 + 120 ot_100",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-11T08:00", end_local: "2026-05-11T20:00" },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 480, ot_25_minutes: 0, ot_50_minutes: 120, ot_100_minutes: 120,
        rules_applied: ["OT_HOUR_9_10", "OT_HOUR_11_PLUS"],
      });
    },
  },
  {
    name: "Mo 12h + 30min pause → pause deducted from 100% bucket",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-11T08:00", end_local: "2026-05-11T20:00", unpaid_break_minutes: 30 },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 480, ot_25_minutes: 0, ot_50_minutes: 120, ot_100_minutes: 90,
      });
    },
  },
  {
    name: "Mo 12h + 150min pause → drains 100% then eats into 50%",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-11T08:00", end_local: "2026-05-11T20:00", unpaid_break_minutes: 150 },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 480, ot_25_minutes: 0, ot_50_minutes: 90, ot_100_minutes: 0,
      });
    },
  },
  {
    name: "Sa 8h, 6-day-week model (target 480) → 480 ot_25",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-09T09:00", end_local: "2026-05-09T17:00" },
        SIX_DAY_WEEK,
      );
      expectBreakdown(r, {
        base_minutes: 0, ot_25_minutes: 480, ot_50_minutes: 0, ot_100_minutes: 0,
        rules_applied: ["SATURDAY_BASE"],
      });
    },
  },
  {
    name: "Sa 8h with no-swap → 480 ot_100",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-09T09:00", end_local: "2026-05-09T17:00", saturday_no_swap_agreement: true },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 0, ot_25_minutes: 0, ot_50_minutes: 0, ot_100_minutes: 480,
        rules_applied: ["SATURDAY_NO_SWAP"],
      });
    },
  },
  {
    name: "Sa 4h, 5-day-week (Sa target 0) → all OT: 120 ot_50 + 120 ot_100",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-09T09:00", end_local: "2026-05-09T13:00" },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 0, ot_25_minutes: 0, ot_50_minutes: 120, ot_100_minutes: 120,
        rules_applied: ["SATURDAY_OT_9_10", "SATURDAY_OT_11_PLUS"],
      });
    },
  },
  {
    name: "So 8h, target 0 (typical) → 480 ot_100 (Mehrarbeit)",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-10T09:00", end_local: "2026-05-10T17:00" },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 0, ot_25_minutes: 0, ot_50_minutes: 0, ot_100_minutes: 480,
        rules_applied: ["SUNDAY_OVERTIME"],
      });
    },
  },
  {
    name: "So 12h, 7-day model (target 480) → 480 ot_25 + 240 ot_100",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-10T06:00", end_local: "2026-05-10T18:00" },
        SIX_DAY_WEEK,
      );
      expectBreakdown(r, {
        base_minutes: 0, ot_25_minutes: 480, ot_50_minutes: 0, ot_100_minutes: 240,
        rules_applied: ["SUNDAY_BASE", "SUNDAY_OVERTIME"],
      });
    },
  },
  {
    name: "Night Mo 02:00–06:00 (4h, target 480) → 240 ot_50 (night-base)",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-11T02:00", end_local: "2026-05-11T06:00" },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 0, ot_25_minutes: 0, ot_50_minutes: 240, ot_100_minutes: 0,
        rules_applied: ["NIGHT_BASE"],
      });
    },
  },
  {
    name: "Mo 04:00–10:00 (target 480) → 120 ot_50 night + 240 base",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-11T04:00", end_local: "2026-05-11T10:00" },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 240, ot_25_minutes: 0, ot_50_minutes: 120, ot_100_minutes: 0,
        rules_applied: ["NIGHT_BASE"],
      });
    },
  },
  {
    name: "Midnight-split Mo 22:00 → Tue 02:00 → 120 base (Mo) + 120 ot_50 (Tue night)",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-11T22:00", end_local: "2026-05-12T02:00" },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 120, ot_25_minutes: 0, ot_50_minutes: 120, ot_100_minutes: 0,
        rules_applied: ["NIGHT_BASE"],
      });
    },
  },
  {
    name: "Sunday-Night-OT max policy: So 02:00–04:00 (target 0) → 120 ot_100, both rules listed",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-10T02:00", end_local: "2026-05-10T04:00" },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 0, ot_25_minutes: 0, ot_50_minutes: 0, ot_100_minutes: 120,
        rules_applied: ["SUNDAY_OVERTIME", "NIGHT_OVERTIME"],
      });
    },
  },
  {
    name: "Sunday-Night-OT sum policy: bucket still clamps to 100",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-10T02:00", end_local: "2026-05-10T04:00" },
        WEEKDAY_TARGET_480,
        { combination: "sum" },
      );
      expectBreakdown(r, {
        base_minutes: 0, ot_25_minutes: 0, ot_50_minutes: 0, ot_100_minutes: 120,
      });
    },
  },
  {
    name: "Empty / inverted window returns zero breakdown",
    run: () => {
      const r = calculateSurcharges(
        { start_local: "2026-05-11T10:00", end_local: "2026-05-11T10:00" },
        WEEKDAY_TARGET_480,
      );
      expectBreakdown(r, {
        base_minutes: 0, ot_25_minutes: 0, ot_50_minutes: 0, ot_100_minutes: 0,
        rules_applied: [],
      });
    },
  },
  {
    name: "Idempotent: running engine twice on same input yields identical output",
    run: () => {
      const input = { start_local: "2026-05-11T08:00", end_local: "2026-05-11T20:00", unpaid_break_minutes: 30 };
      const a = calculateSurcharges(input, WEEKDAY_TARGET_480);
      const b = calculateSurcharges(input, WEEKDAY_TARGET_480);
      assert.deepEqual(a, b);
    },
  },
];

let failed = 0;
for (const c of cases) {
  try {
    c.run();
    process.stdout.write(`ok  ${c.name}\n`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`FAIL  ${c.name}\n  ${msg}\n`);
  }
}
process.stdout.write(`\n${cases.length - failed}/${cases.length} passed\n`);
if (failed > 0) process.exit(1);
