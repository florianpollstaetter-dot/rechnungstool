-- Migration: harden user_work_schedules (SCH-369 — Backend Engineer follow-up)
-- Run AFTER supabase_migration_user_work_schedules.sql.
--
-- Adds:
--   1. CHECK constraint: when both Von/Bis are set, Bis must be strictly later
--      than Von (the admin UI prevents this, but DB-level enforcement protects
--      direct SQL imports / future bulk-load paths).
--   2. updated_at BEFORE-UPDATE trigger so server-side or psql updates also
--      bump the timestamp without relying on the caller passing it.
--   3. A short table comment for psql / Supabase introspection.

-- 1. Bis > Von (only enforced when both columns are populated).
ALTER TABLE public.user_work_schedules
  DROP CONSTRAINT IF EXISTS user_work_schedules_time_range_check;

ALTER TABLE public.user_work_schedules
  ADD CONSTRAINT user_work_schedules_time_range_check
  CHECK (
    start_time IS NULL
    OR end_time IS NULL
    OR end_time > start_time
  );

-- 2. Generic updated_at trigger function (reused if other tables want it later).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_work_schedules_set_updated_at
  ON public.user_work_schedules;

CREATE TRIGGER user_work_schedules_set_updated_at
  BEFORE UPDATE ON public.user_work_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 3. Documentation.
COMMENT ON TABLE public.user_work_schedules IS
  'Per-user weekly work schedule (SCH-369). Weekday encoding: 0=Mon, 6=Sun. '
  'daily_target_minutes is the source of truth for pensum; start_time/end_time '
  'are informational and used by analytics for proportional "today so far" '
  'progress. Unique on (user_id, weekday) — at most one row per weekday.';
