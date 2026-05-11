#!/usr/bin/env -S npx tsx
/**
 * SCH-2088 — Backfill Zuschlagsberechnung for existing time_entries rows.
 *
 * Run once after the migration lands. Idempotent: re-running on an already
 * backfilled row recomputes the same breakdown (engine is deterministic).
 *
 * Usage:
 *   SUPABASE_URL=https://kjxmanenruaqzrzjueny.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/backfill-time-entry-surcharges.ts [--dry-run]
 *
 * Env (loaded from .env.local if present):
 *   SUPABASE_URL                — project base URL
 *   SUPABASE_SERVICE_ROLE_KEY   — service role key (bypasses RLS)
 *
 * Output: per-batch progress line + final summary.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { computeSurchargeColumns } from "../src/lib/surcharge/save-hook";

const BATCH_SIZE = 200;

interface TimeEntryRow {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string | null;
  entry_type: string;
}

interface WorkScheduleRow {
  weekday: number;
  daily_target_minutes: number;
  unpaid_break_minutes: number;
}

function loadEnvLocal(): void {
  try {
    const path = join(process.cwd(), ".env.local");
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local optional — env may already be exported.
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env or .env.local.");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("DRY RUN — no rows will be updated.");

  const supa = createClient(url, key, { auth: { persistSession: false } });

  // Per-user schedule cache so we don't re-fetch on every entry.
  const scheduleCache = new Map<string, WorkScheduleRow[]>();
  async function getSchedule(userId: string): Promise<WorkScheduleRow[]> {
    const cached = scheduleCache.get(userId);
    if (cached) return cached;
    const { data } = await supa
      .from("user_work_schedules")
      .select("weekday, daily_target_minutes, unpaid_break_minutes")
      .eq("user_id", userId);
    const rows = (data ?? []) as WorkScheduleRow[];
    scheduleCache.set(userId, rows);
    return rows;
  }

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let lastId: string | null = null;

  while (true) {
    let q = supa
      .from("time_entries")
      .select("id, user_id, start_time, end_time, entry_type")
      .eq("entry_type", "work")
      .not("end_time", "is", null)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q;
    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as TimeEntryRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      processed += 1;
      if (!row.end_time) { skipped += 1; continue; }
      const schedules = await getSchedule(row.user_id);
      const cols = computeSurchargeColumns(row.start_time, row.end_time, schedules);
      if (!dryRun) {
        const { error: upErr } = await supa
          .from("time_entries")
          .update({
            surcharge_breakdown: cols.surcharge_breakdown,
            base_minutes: cols.base_minutes,
            ot_25_minutes: cols.ot_25_minutes,
            ot_50_minutes: cols.ot_50_minutes,
            ot_100_minutes: cols.ot_100_minutes,
          })
          .eq("id", row.id);
        if (upErr) {
          console.error(`Update ${row.id} failed:`, upErr.message);
          process.exit(1);
        }
      }
      updated += 1;
    }
    lastId = rows[rows.length - 1].id;
    console.log(`  processed=${processed} updated=${updated} skipped=${skipped}`);
  }

  console.log(`\nDone. processed=${processed} updated=${updated} skipped=${skipped}${dryRun ? " (dry run)" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
