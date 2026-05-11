-- SCH-2088: Persist per-entry surcharge breakdown alongside each time_entry.
--
-- The calculation happens in TS (src/lib/surcharge/engine.ts) at save-time
-- (createTimeEntry / updateTimeEntry) and once via the backfill script for
-- existing rows. Storing the breakdown idempotently means the
-- Stundenabrechnung tab (SCH-2089) and payroll exports can sum buckets
-- without re-running the engine.
--
-- Columns:
--   surcharge_breakdown jsonb — full breakdown (rules_applied, raw inputs,
--                               policy used, engine version). Empty object
--                               means "not yet computed" — the save-hook
--                               overwrites on every write.
--   base_minutes / ot_25_minutes / ot_50_minutes / ot_100_minutes — totals
--                               per bucket, denormalized so SQL aggregates
--                               in the Stundenabrechnung view stay cheap.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'time_entries'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'time_entries'
        AND column_name = 'surcharge_breakdown'
    ) THEN
      ALTER TABLE public.time_entries
        ADD COLUMN surcharge_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'time_entries'
        AND column_name = 'base_minutes'
    ) THEN
      ALTER TABLE public.time_entries
        ADD COLUMN base_minutes integer NOT NULL DEFAULT 0
          CHECK (base_minutes >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'time_entries'
        AND column_name = 'ot_25_minutes'
    ) THEN
      ALTER TABLE public.time_entries
        ADD COLUMN ot_25_minutes integer NOT NULL DEFAULT 0
          CHECK (ot_25_minutes >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'time_entries'
        AND column_name = 'ot_50_minutes'
    ) THEN
      ALTER TABLE public.time_entries
        ADD COLUMN ot_50_minutes integer NOT NULL DEFAULT 0
          CHECK (ot_50_minutes >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'time_entries'
        AND column_name = 'ot_100_minutes'
    ) THEN
      ALTER TABLE public.time_entries
        ADD COLUMN ot_100_minutes integer NOT NULL DEFAULT 0
          CHECK (ot_100_minutes >= 0);
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.time_entries.surcharge_breakdown IS
  'SCH-2088 — full Zuschlagsberechnung snapshot. Shape: { base_minutes, '
  'ot_25_minutes, ot_50_minutes, ot_100_minutes, rules_applied, policy, '
  'engine_version, computed_at }. Recomputed on every save by the engine '
  'in src/lib/surcharge/engine.ts.';
