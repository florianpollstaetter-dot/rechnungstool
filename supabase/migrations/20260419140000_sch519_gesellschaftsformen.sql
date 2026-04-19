-- SCH-519: Extended Austrian Gesellschaftsformen + Kleinunternehmer flag + Firmenbuch fields
-- company_type remains a free-text column; new accepted values are documented in src/lib/types.ts
-- (gmbh, ag, kg, gmbh_co_kg, og, eu, ez, verein). No CHECK constraint so new values can ship with
-- code only (matches existing pattern for company_settings columns).

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS firmenbuchnummer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS firmenbuchgericht text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS firmenbuchnummer_komplementaer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS firmenbuchgericht_komplementaer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_kleinunternehmer boolean NOT NULL DEFAULT false;
