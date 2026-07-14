-- ORA-2809 P1: product creation fails with
--   "Could not find the 'description_translations' column of 'products'"
--
-- SCH-447 (20260417211313_content_translations.sql) added the JSONB
-- name_translations / description_translations columns, but production
-- `products` is missing them (or PostgREST's schema cache never picked them
-- up), so every insert/update that carries those keys errors out.
--
-- This migration is idempotent and fixes both root causes:
--   1. Re-adds the columns IF NOT EXISTS (no-op where SCH-447 already applied).
--   2. Backfills from the legacy name/name_en + description/description_en
--      columns for rows still on the empty default.
--   3. Reloads the PostgREST schema cache so supabase-js stops rejecting the
--      columns immediately after deploy.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
    RAISE NOTICE 'products table missing, skipping ORA-2809 migration';
    RETURN;
  END IF;

  ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS name_translations jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS description_translations jsonb NOT NULL DEFAULT '{}'::jsonb;

  UPDATE public.products
  SET name_translations = jsonb_strip_nulls(jsonb_build_object(
    'de', NULLIF(name, ''),
    'en', NULLIF(name_en, '')
  ))
  WHERE name_translations = '{}'::jsonb;

  UPDATE public.products
  SET description_translations = jsonb_strip_nulls(jsonb_build_object(
    'de', NULLIF(description, ''),
    'en', NULLIF(description_en, '')
  ))
  WHERE description_translations = '{}'::jsonb;
END $migration$;

-- Force PostgREST to reload its schema cache so the freshly-present columns
-- are recognised without waiting for the periodic refresh.
NOTIFY pgrst, 'reload schema';
