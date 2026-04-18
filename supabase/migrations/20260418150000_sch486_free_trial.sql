-- SCH-486: free-trial subscription state
--
-- Extends SCH-480's subscription_status to recognise a 'free_trial' value
-- so newly self-registered companies can run for 30 days with full access,
-- then degrade to read-only via the SCH-481 trigger after trial expiry.
--
-- Changes:
--   1. New column `trial_started_at` on companies (nullable timestamptz).
--      `trial_ends_at` already exists from the original companies schema.
--   2. Relax the subscription_status CHECK constraint to allow 'free_trial'.
--   3. Replace `is_company_read_only` so a company is also read-only when
--      `subscription_status = 'free_trial'` AND `trial_ends_at < now()`.
--      The SCH-481 BEFORE-write triggers already call this function, so
--      no trigger changes are needed.

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'companies') THEN
    RAISE NOTICE 'companies table missing, skipping SCH-486 migration';
    RETURN;
  END IF;

  -- 1. Trial start timestamp (trial_ends_at already exists).
  ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

  -- 2. Allow 'free_trial' in the subscription_status check.
  ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_subscription_status_check;
  ALTER TABLE companies
    ADD CONSTRAINT companies_subscription_status_check
    CHECK (subscription_status IN ('paid', 'outstanding', 'overdue', 'free_trial'));

  -- 3. Read-only definition now covers expired free trials too. The SCH-481
  --    triggers already call this function — replacing the body is enough.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_company_read_only'
  ) THEN
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
            AND (
              -- SCH-481: long-overdue paid customers
              (
                c.subscription_status = 'overdue'
                AND c.next_payment_due_at IS NOT NULL
                AND c.next_payment_due_at < (now() - INTERVAL '60 days')
              )
              OR
              -- SCH-486: free trial elapsed
              (
                c.subscription_status = 'free_trial'
                AND c.trial_ends_at IS NOT NULL
                AND c.trial_ends_at < now()
              )
            )
        );
      $body$;
    $f$;

    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_company_read_only(TEXT) TO authenticated, anon, service_role';
  END IF;
END $migration$;
