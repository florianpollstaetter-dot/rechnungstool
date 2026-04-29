-- SCH-921 (K2-J1): Admin-defined "Allgemein" categories for time tracking.
--
-- The Zeiterfassung create-modal currently hardcodes two label groups
-- (Allgemein + Sonstiges). Admins want to manage that list themselves so
-- different companies can keep their own non-project labels (e.g. "Daily",
-- "Sprint Planning", "Recruiting", "On-Call"). This migration adds a
-- per-company table and seeds the previously-hardcoded defaults so the
-- existing UI keeps working immediately after deploy.

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- general_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.general_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  text NOT NULL,
  label       text NOT NULL,
  group_key   text NOT NULL DEFAULT 'allgemein'
              CHECK (group_key IN ('allgemein', 'sonstiges')),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, group_key, label)
);

CREATE INDEX IF NOT EXISTS idx_general_categories_company
  ON public.general_categories (company_id);

DROP TRIGGER IF EXISTS general_categories_set_updated_at
  ON public.general_categories;
CREATE TRIGGER general_categories_set_updated_at
  BEFORE UPDATE ON public.general_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.general_categories IS
  'Admin-managed labels for the Zeiterfassung "Allgemein" + "Sonstiges" '
  'tabs (SCH-921 K2-J1). Replaces the hardcoded GENERAL_ITEMS / OTHER_ITEMS '
  'lists in TimeCalendarCreateModal. Visible to all company users; mutable '
  'only by company admins (enforced in app + permissions library).';

-- ---------------------------------------------------------------------------
-- RLS — same tenant-isolation pattern as smart_insights_config
-- ---------------------------------------------------------------------------
ALTER TABLE public.general_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.general_categories;
CREATE POLICY "tenant_isolation" ON public.general_categories
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---------------------------------------------------------------------------
-- Seed: replicate the previously-hardcoded labels for every active company
-- so the UI keeps the same defaults out of the box. ON CONFLICT keeps this
-- idempotent across re-runs and across companies that already migrated.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  c RECORD;
  i INTEGER;
  allgemein_labels TEXT[] := ARRAY[
    'Daily', 'Weekly', 'Meeting Team', 'Meeting Agentur',
    'Neues Projekt', 'Briefing', 'Administration', 'E-Mails'
  ];
  sonstiges_labels TEXT[] := ARRAY[
    'Weiterbildung', 'Reise', 'Krankheit', 'Urlaub', 'Sonstiges'
  ];
BEGIN
  FOR c IN SELECT id FROM public.companies WHERE status = 'active' LOOP
    FOR i IN 1..array_length(allgemein_labels, 1) LOOP
      INSERT INTO public.general_categories (company_id, label, group_key, sort_order)
      VALUES (c.id, allgemein_labels[i], 'allgemein', i * 10)
      ON CONFLICT (company_id, group_key, label) DO NOTHING;
    END LOOP;
    FOR i IN 1..array_length(sonstiges_labels, 1) LOOP
      INSERT INTO public.general_categories (company_id, label, group_key, sort_order)
      VALUES (c.id, sonstiges_labels[i], 'sonstiges', i * 10)
      ON CONFLICT (company_id, group_key, label) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
