-- SCH-582: track whether a user has seen (or skipped) the first-login
-- onboarding tour so we never re-show it automatically. NULL = not-yet-done,
-- non-NULL = completed or intentionally skipped.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
