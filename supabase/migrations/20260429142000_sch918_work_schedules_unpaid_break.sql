-- SCH-918 (K2-γ G10): Add "unbezahlte Pause pro Tag" to user_work_schedules.
--
-- Per-day unpaid break duration in minutes. Subtracted from the gross window
-- (end_time - start_time) when computing daily target / overtime in the
-- time-tracking UI. Defaults to 0 so existing rows keep their current target
-- behaviour. CHECK keeps it non-negative.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_work_schedules'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_work_schedules'
        AND column_name = 'unpaid_break_minutes'
    ) THEN
      ALTER TABLE public.user_work_schedules
        ADD COLUMN unpaid_break_minutes INTEGER NOT NULL DEFAULT 0
          CHECK (unpaid_break_minutes >= 0);
    END IF;
  END IF;
END $$;
