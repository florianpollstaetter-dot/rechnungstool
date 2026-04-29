-- SCH-914: P0 Settings-Save-Bugs (K3-R1 Arbeitszeitmodell + K3-R2 Unternehmensdaten)
--
-- K3-R1 — Arbeitszeitmodelle could not be saved:
--   The `user_work_schedules` table is missing in production even though
--   migration 20260416165731 is recorded as applied (likely dropped via
--   dashboard or never created cleanly). Recreate idempotently with the
--   v2 hardening (time-range CHECK, updated_at trigger) and re-attach the
--   tenant-aware RLS policies (per the original 20260418093458 macro).
--
-- K3-R2 — Unternehmensdaten could not be saved for tenants without a
--   company_settings row (e.g. legacy `vrthefans`, never seeded by
--   register-company since that route only exists for self-registration).
--   `getSettings()` falls back to DEFAULT_SETTINGS and `updateSettings()`
--   filters by `company_id`, but no row matches → `.single()` rejects with
--   "no row" and the UI silently swallows the error. Backfill a row for
--   every active company that lacks one so the existing update path works
--   without further code changes.

-- ---------------------------------------------------------------------------
-- 1. Recreate user_work_schedules (idempotent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time,
  end_time time,
  daily_target_minutes integer NOT NULL DEFAULT 0 CHECK (daily_target_minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_user_work_schedules_user_id
  ON public.user_work_schedules (user_id);

-- v2 hardening: end_time > start_time when both set.
ALTER TABLE public.user_work_schedules
  DROP CONSTRAINT IF EXISTS user_work_schedules_time_range_check;
ALTER TABLE public.user_work_schedules
  ADD CONSTRAINT user_work_schedules_time_range_check
  CHECK (
    start_time IS NULL
    OR end_time IS NULL
    OR end_time > start_time
  );

-- Reuse the generic set_updated_at() trigger function from earlier migrations,
-- but redefine defensively in case the v2 migration was lost together with
-- the table.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_work_schedules_set_updated_at
  ON public.user_work_schedules;
CREATE TRIGGER user_work_schedules_set_updated_at
  BEFORE UPDATE ON public.user_work_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Re-attach RLS for user_work_schedules
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_work_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_schedules_select" ON public.user_work_schedules;
CREATE POLICY "own_schedules_select" ON public.user_work_schedules
  FOR SELECT
  USING (
    user_id = (
      SELECT id FROM public.user_profiles
      WHERE auth_user_id = (select auth.uid())
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "own_schedules_modify" ON public.user_work_schedules;
CREATE POLICY "own_schedules_modify" ON public.user_work_schedules
  FOR ALL
  USING (
    user_id = (
      SELECT id FROM public.user_profiles
      WHERE auth_user_id = (select auth.uid())
      LIMIT 1
    )
  )
  WITH CHECK (
    user_id = (
      SELECT id FROM public.user_profiles
      WHERE auth_user_id = (select auth.uid())
      LIMIT 1
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Backfill missing company_settings rows for every active company.
--    The tenant_isolation policy on company_settings keys off
--    `id = active_company_id()`. If the row is missing for a tenant the
--    update path returns no row and the save silently fails. Insert a
--    minimal row for any company without one so the existing settings page
--    can immediately update it.
-- ---------------------------------------------------------------------------
INSERT INTO public.company_settings (
  id,
  company_id,
  company_name,
  company_type,
  address,
  city,
  zip,
  uid,
  iban,
  bic,
  phone,
  email,
  logo_url,
  default_tax_rate,
  default_payment_terms_days,
  next_invoice_number,
  next_quote_number,
  accompanying_text_de,
  accompanying_text_en
)
SELECT
  c.id,
  c.id,
  c.name,
  'gmbh',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  20,
  14,
  1,
  1,
  'Vielen Dank für Ihren Auftrag!',
  'Thank you for your order!'
FROM public.companies c
LEFT JOIN public.company_settings cs ON cs.id = c.id
WHERE cs.id IS NULL
  AND c.status = 'active'
ON CONFLICT (id) DO NOTHING;

-- Defensive: clean up the legacy 'default' orphan row if it still exists
-- (no company has slug 'default'; the row dates back to the original DEFAULT
-- on the `id` column and is now unreachable via RLS).
DELETE FROM public.company_settings
WHERE id = 'default'
  AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = 'default');
