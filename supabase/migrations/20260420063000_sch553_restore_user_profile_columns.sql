-- SCH-553: Admin "Mitarbeiter erstellen" crashes with "null is not an object
-- (evaluating 'e.id')". Root cause is schema drift: user_profiles is missing
-- columns that earlier migrations were supposed to add.
--
-- Expected columns per code/UserProfile type:
--   - accompanying_text_de      (SCH-409 / 20260417154736_user_accompanying_text)
--   - accompanying_text_en      (SCH-409 / 20260417154736_user_accompanying_text)
--   - accompanying_text_translations (SCH-447 / 20260417211313_content_translations)
--
-- Those migrations show as applied in supabase_migrations.schema_migrations but
-- the columns are absent in the live DB. Re-add them defensively with IF NOT
-- EXISTS so the insert path succeeds regardless of how the schema drifted.
-- greeting_tone is handled by the still-pending 20260419120000_sch518_greeting_tone.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS accompanying_text_de TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS accompanying_text_en TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS accompanying_text_translations JSONB NOT NULL DEFAULT '{}'::jsonb;
