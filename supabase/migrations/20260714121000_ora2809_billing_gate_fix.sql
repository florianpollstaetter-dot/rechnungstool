-- ORA-2809 H0: the read-only billing gate fires false positives.
--
-- A QA company on `subscription_status = 'free_trial'` with an expired
-- `trial_ends_at` was flipped to read-only and shown "Rechnung ueberfaellig",
-- even though billing is still Stripe-sandbox and no real invoice is open.
-- Root cause: SCH-486 added a `free_trial AND trial_ends_at < now()` branch to
-- `is_company_read_only()`, conflating "trial elapsed" with "invoice overdue".
--
-- Fixes:
--   1. Global BILLING switch (public.app_config.billing_enabled, default FALSE):
--      while Stripe is sandbox the gate is fully disabled — nothing is readonly.
--   2. Read-only now only reflects REAL Stripe billing failure:
--      overdue >60d, or a cancelled subscription. The free_trial branch is
--      removed — an elapsed trial is a separate UX state, not "overdue".
--   3. Internal / test companies (is_free OR is_internal) are always exempt.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'companies'
  ) THEN
    RAISE NOTICE 'companies table missing, skipping ORA-2809 billing-gate migration';
    RETURN;
  END IF;

  -- Internal/test flag so real-billing enforcement never touches our own tenants.
  ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

  -- Global feature switch. Kept in a tiny key/value table so it can be flipped
  -- with one UPDATE (no deploy) once Stripe leaves sandbox.
  CREATE TABLE IF NOT EXISTS public.app_config (
    key        text PRIMARY KEY,
    value      jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO public.app_config (key, value)
  VALUES ('billing_enabled', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;
END $migration$;

-- Reads the global billing switch; defaults to disabled if the row is absent.
CREATE OR REPLACE FUNCTION public.billing_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::boolean FROM public.app_config WHERE key = 'billing_enabled'),
    false
  );
$body$;

GRANT EXECUTE ON FUNCTION public.billing_enabled() TO authenticated, anon, service_role;

-- Redefined read-only rule: gated by the global switch, exempts internal/free
-- tenants, and reacts ONLY to real Stripe billing failure (not trial expiry).
CREATE OR REPLACE FUNCTION public.is_company_read_only(p_company_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT public.billing_enabled()
    AND EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = p_company_id
        AND COALESCE(c.is_free, false) = false
        AND COALESCE(c.is_internal, false) = false
        AND (
          -- long-overdue paid customer (>60d past due)
          (
            c.subscription_status = 'overdue'
            AND c.next_payment_due_at IS NOT NULL
            AND c.next_payment_due_at < (now() - INTERVAL '60 days')
          )
          -- Stripe subscription fully cancelled
          OR c.subscription_status = 'cancelled'
        )
    );
$body$;

GRANT EXECUTE ON FUNCTION public.is_company_read_only(TEXT) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
