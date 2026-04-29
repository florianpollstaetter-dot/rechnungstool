-- SCH-918 (K2-γ G2): Per-feature granular permissions for company members.
--
-- Adds a JSONB `permissions` column on company_members. The 9 boolean keys
-- gate visibility of app sections that an "employee"-role member is allowed
-- to use within a given company. Owner/admin role short-circuits in app-code
-- (see lib/permissions.ts) and ignores the JSONB content.
--
-- NOTE: this is feature-gating in app code, not RLS. Tenant-isolation RLS
-- continues to scope reads/writes by company_id; permissions narrow which
-- sections the UI/API even attempts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_members'
  ) THEN
    -- Add column with default-false for every key
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'company_members'
        AND column_name = 'permissions'
    ) THEN
      ALTER TABLE public.company_members
        ADD COLUMN permissions JSONB NOT NULL DEFAULT jsonb_build_object(
          'angebote',           false,
          'rechnungen',         false,
          'kunden',             false,
          'produkte',           false,
          'fixkosten',          false,
          'belege',             false,
          'konto',              false,
          'export',             false,
          'projekte_erstellen', false
        );
    END IF;

    -- Backfill: existing owner/admin members get all-true so we don't lock
    -- anyone out of features they had before this migration. Members default
    -- to all-false; admin must explicitly grant via UI.
    UPDATE public.company_members
    SET permissions = jsonb_build_object(
      'angebote',           true,
      'rechnungen',         true,
      'kunden',             true,
      'produkte',           true,
      'fixkosten',          true,
      'belege',             true,
      'konto',              true,
      'export',             true,
      'projekte_erstellen', true
    )
    WHERE role IN ('owner', 'admin')
      AND (
        permissions IS NULL
        OR permissions = '{}'::jsonb
        OR permissions = jsonb_build_object(
          'angebote',           false,
          'rechnungen',         false,
          'kunden',             false,
          'produkte',           false,
          'fixkosten',          false,
          'belege',             false,
          'konto',              false,
          'export',             false,
          'projekte_erstellen', false
        )
      );
  END IF;
END $$;
