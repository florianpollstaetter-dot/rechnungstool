-- SCH-889: persist the active Stripe plan + billing interval on companies.
--
-- Until now `companies.subscription_status` only told us paid|outstanding|...
-- which was enough to gate access but not enough for the UI to highlight
-- *which* plan the user is on. The Stripe webhook + a one-shot reconcile
-- endpoint now write `subscription_plan` + `subscription_interval` so the
-- Settings → Abonnement page can render an "Aktueller Plan"-Badge and
-- swap the per-card CTA between Verwalten/Upgrade/Downgrade.
--
-- Plan keys mirror PLANS in src/lib/plans.ts. Interval mirrors Stripe's
-- recurring.interval. Both are NULL until the first paid subscription.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT NULL,
  ADD COLUMN IF NOT EXISTS subscription_interval TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_subscription_plan_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_subscription_plan_check
      CHECK (subscription_plan IS NULL OR subscription_plan IN ('starter', 'business', 'pro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_subscription_interval_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_subscription_interval_check
      CHECK (subscription_interval IS NULL OR subscription_interval IN ('month', 'year'));
  END IF;
END $$;
