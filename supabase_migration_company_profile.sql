-- Migration: Company Profile Fields (SCH-410)
-- Adds industry, website, and description to company_settings.
-- These fields feed the AI Firmen-Setup and are displayed in settings.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.company_settings.industry IS
  'Branche der Firma (z.B. Filmproduktion, IT). Optional, wird auch '
  'vom AI-Setup erkannt und gesetzt. Wird als Input für AI-Vorschläge verwendet.';

COMMENT ON COLUMN public.company_settings.website IS
  'Firmen-Website (z.B. www.firma.at). Optional, wird für die AI-Web-Recherche verwendet.';

COMMENT ON COLUMN public.company_settings.description IS
  'Kurzbeschreibung der Firma. Optional, unterstützt AI-Setup bei der Branchenerkennung.';
