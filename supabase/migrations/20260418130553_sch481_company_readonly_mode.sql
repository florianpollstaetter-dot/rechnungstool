-- SCH-481: Read-only mode for companies overdue >60 days
--
-- When `subscription_status = 'overdue'` AND the company is not free
-- AND `next_payment_due_at` is more than 60 days in the past, the
-- company enters read-only mode: existing rows can still be SELECTed
-- but no new rows can be inserted/updated/deleted in business tables.
--
-- Enforced via a single BEFORE INSERT/UPDATE/DELETE trigger on each
-- writable, company-scoped table. Triggers run regardless of the
-- caller's role, so this also blocks service-role API routes that
-- bypass RLS (e.g. /api/projects/create-from-quote).
--
-- The whole migration is wrapped in a single DO block so it can be
-- skipped cleanly if SCH-480's payment-status columns are not yet
-- present in the target environment.

DO $migration$
DECLARE
  v_table TEXT;
  v_writable_tables TEXT[] := ARRAY[
    'customers',
    'products',
    'invoices',
    'quotes',
    'expense_reports',
    'expense_items',
    'time_entries',
    'projects',
    'tasks',
    'receipts',
    'templates',
    'fixed_costs',
    'bank_statements',
    'bank_transactions',
    'company_settings',
    'company_roles',
    'user_role_assignments',
    'smart_insights_config',
    'user_dashboard_layouts'
  ];
BEGIN
  -- Bail out if SCH-480's columns are not present yet. This keeps the
  -- migration idempotent across environments where SCH-480 has not been
  -- applied — the next CI run will retry once SCH-480 lands.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'is_free'
  ) THEN
    RAISE NOTICE 'SCH-480 columns missing on companies, skipping SCH-481 migration';
    RETURN;
  END IF;

  -- 1. Helper: is the company past the 60-day overdue threshold?
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.is_company_read_only(p_company_id TEXT)
    RETURNS BOOLEAN
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
      SELECT EXISTS (
        SELECT 1 FROM companies c
        WHERE c.id = p_company_id
          AND COALESCE(c.is_free, false) = false
          AND c.subscription_status = 'overdue'
          AND c.next_payment_due_at IS NOT NULL
          AND c.next_payment_due_at < (now() - INTERVAL '60 days')
      );
    $body$;
  $f$;

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_company_read_only(TEXT) TO authenticated, anon, service_role';

  -- 2. Trigger function: reject writes when company is read-only.
  --    Resolves the company_id from the row (NEW for INSERT/UPDATE,
  --    OLD for DELETE). The error message is intentionally user-facing —
  --    the client surfaces it directly in the UI.
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.enforce_company_not_readonly()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $body$
    DECLARE
      v_company_id TEXT;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        v_company_id := OLD.company_id;
      ELSE
        v_company_id := NEW.company_id;
      END IF;

      IF v_company_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
      END IF;

      IF public.is_company_read_only(v_company_id) THEN
        RAISE EXCEPTION
          'Rechnung ueberfaellig — Funktionen eingeschraenkt. Bitte ausstehende Rechnung begleichen.'
          USING ERRCODE = 'P0001';
      END IF;

      RETURN COALESCE(NEW, OLD);
    END;
    $body$;
  $f$;

  -- 3. Apply trigger to every writable, company-scoped table that exists.
  --    company_settings has both `id` (legacy) and `company_id`; the
  --    company_id branch is what db.ts queries against.
  FOREACH v_table IN ARRAY v_writable_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'company_id'
    ) THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_%I_enforce_readonly ON public.%I',
        v_table, v_table
      );
      EXECUTE format(
        'CREATE TRIGGER trg_%I_enforce_readonly BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_company_not_readonly()',
        v_table, v_table
      );
    END IF;
  END LOOP;
END $migration$;
