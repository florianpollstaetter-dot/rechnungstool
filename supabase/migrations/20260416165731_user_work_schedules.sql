-- Migration: Per-user weekly work schedule (SCH-369)
-- Run this against the Supabase database before deploying.
--
-- Weekday encoding: 0 = Monday, 6 = Sunday (ISO-style, matches the
-- Mo Di Mi Do Fr Sa So ordering used throughout the UI).
--
-- start_time / end_time are optional so "rest day" rows can be stored as
-- a 0-minute target without fake times. daily_target_minutes is the
-- source of truth for pensum; the times are informational unless the
-- caller chooses to derive the target from them.

CREATE TABLE IF NOT EXISTS public.user_work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time,
  end_time time,
  daily_target_minutes integer NOT NULL DEFAULT 0 CHECK (daily_target_minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_user_work_schedules_user_id
  ON public.user_work_schedules (user_id);
