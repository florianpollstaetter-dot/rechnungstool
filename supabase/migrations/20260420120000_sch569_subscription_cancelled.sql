-- SCH-569: Stripe integration — add 'cancelled' to subscription_status
--
-- Stripe's subscription lifecycle includes a terminal `cancelled` state that
-- the app must treat as read-only (past trial end, no active payment method,
-- subscription fully closed). The Stripe webhook handler maps
-- `customer.subscription.deleted` → `subscription_status = 'cancelled'`.
--
-- Changes:
--   1. Relax the subscription_status CHECK constraint to allow 'cancelled'.
--   2. Extend `is_company_read_only` so a company with status = 'cancelled'
--      flips into read-only mode immediately (no 60-day grace like 'overdue').

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'companies') THEN
    RAISE NOTICE 'companies table missing, skipping SCH-569 migration';
    RETURN;
  END IF;

  ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_subscription_status_check;
  ALTER TABLE companies
    ADD CONSTRAINT companies_subscription_status_check
    CHECK (subscription_status IN ('paid', 'outstanding', 'overdue', 'free_trial', 'cancelled'));

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
              OR
              -- SCH-569: Stripe subscription fully cancelled
              c.subscription_status = 'cancelled'
            )
        );
      $body$;
    $f$;

    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_company_read_only(TEXT) TO authenticated, anon, service_role';
  END IF;
END $migration$;
