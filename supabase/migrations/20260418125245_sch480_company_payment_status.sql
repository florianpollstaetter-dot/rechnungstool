-- SCH-480: payment status per company + Stripe prep + free-tier toggle
--
-- Adds columns so the superadmin UI can show paid / outstanding / overdue
-- per company and so that Stripe integration later can write into the same
-- fields. A company flagged `is_free = true` is excluded from payment
-- enforcement (manual freebies: partners, internal, etc.).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'companies') THEN
    RAISE NOTICE 'companies table missing, skipping SCH-480 migration';
    RETURN;
  END IF;

  ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'paid',
    ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS next_payment_due_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

  -- Enforce subscription_status values. Drop-then-add so re-runs are idempotent.
  ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_subscription_status_check;
  ALTER TABLE companies
    ADD CONSTRAINT companies_subscription_status_check
    CHECK (subscription_status IN ('paid', 'outstanding', 'overdue'));
END $$;

CREATE INDEX IF NOT EXISTS companies_subscription_status_idx
  ON companies (subscription_status)
  WHERE is_free = FALSE;

CREATE INDEX IF NOT EXISTS companies_next_payment_due_at_idx
  ON companies (next_payment_due_at)
  WHERE is_free = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_customer_id_uidx
  ON companies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_subscription_id_uidx
  ON companies (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
