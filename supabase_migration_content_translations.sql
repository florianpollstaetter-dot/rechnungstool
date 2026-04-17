-- SCH-447: Extend user-content to all 8 UI languages (DE, EN, FR, ES, IT, TR, PL, AR).
-- Uses JSONB per translatable field (research-recommended approach: one column per field,
-- keys are locale codes). Existing DE/EN columns are preserved for backward compat
-- and backfilled into the JSONB.

-- 1. Products: name + description translations
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

-- 2. Company settings: accompanying_text translations
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS accompanying_text_translations jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.company_settings
SET accompanying_text_translations = jsonb_strip_nulls(jsonb_build_object(
  'de', NULLIF(accompanying_text_de, ''),
  'en', NULLIF(accompanying_text_en, '')
))
WHERE accompanying_text_translations = '{}'::jsonb;

-- 3. User profiles: accompanying_text translations
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS accompanying_text_translations jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.user_profiles
SET accompanying_text_translations = jsonb_strip_nulls(jsonb_build_object(
  'de', NULLIF(accompanying_text_de, ''),
  'en', NULLIF(accompanying_text_en, '')
))
WHERE accompanying_text_translations = '{}'::jsonb;
