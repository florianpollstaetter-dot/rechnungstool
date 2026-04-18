-- Migration: Add entry_type to time_entries for Pause support (SCH-368)
-- Run this against the Supabase database before deploying.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'work'
  CHECK (entry_type IN ('work', 'pause'));

-- Backfill any legacy rows (ADD COLUMN with DEFAULT already handles new rows;
-- this keeps explicit-update callers safe if they ever NULL the column).
UPDATE public.time_entries SET entry_type = 'work' WHERE entry_type IS NULL;
