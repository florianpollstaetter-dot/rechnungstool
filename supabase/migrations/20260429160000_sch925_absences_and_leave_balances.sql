-- SCH-925 (K2-ι) — Urlaub/Abwesenheit + ZE-Settings.
--
-- Two new per-company tables:
--   - absences:             a vacation / comp-time / sick / other-absence
--                           record for one user spanning [starts_on, ends_on]
--                           (inclusive). working_days is the number of
--                           workdays the absence consumes — populated by the
--                           UI based on the user's work schedule, so weekends
--                           don't double-count.
--   - user_leave_balances:  per-user, per-year starting values for vacation
--                           days, overtime/undertime minutes. Admins enter
--                           these when onboarding a new MA so the
--                           Resturlaub / ±Stunden cards already show the
--                           carry-over from the previous year.
--
-- Both tables follow the standard tenant-isolation pattern: company_id text
-- column, RLS policy USING/CHECK against active_company_id(), updated_at
-- trigger helper.

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (idempotent — already created by SCH-921, but
-- repeating it here so this migration is self-contained if applied alone)
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
-- absences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.absences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    text NOT NULL,
  user_id       uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL
                CHECK (kind IN ('vacation', 'comp_time', 'sick', 'other')),
  starts_on     date NOT NULL,
  ends_on       date NOT NULL,
  working_days  numeric(5, 2) NOT NULL DEFAULT 0
                CHECK (working_days >= 0),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_absences_company_user
  ON public.absences (company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_absences_user_starts
  ON public.absences (user_id, starts_on);

DROP TRIGGER IF EXISTS absences_set_updated_at ON public.absences;
CREATE TRIGGER absences_set_updated_at
  BEFORE UPDATE ON public.absences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.absences IS
  'SCH-925 (K2-ι Q3) — Urlaub/ZA/Krankheit/Sonstige Abwesenheit. '
  'working_days is the number of weekdays the absence consumes; the UI '
  'pre-fills it based on the users work schedule when the row is created '
  'so weekends don''t inflate the Resturlaub deduction.';

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.absences;
CREATE POLICY "tenant_isolation" ON public.absences
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---------------------------------------------------------------------------
-- user_leave_balances
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_leave_balances (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  text NOT NULL,
  user_id                     uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  year                        integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  -- annual entitlement (e.g. 25 days/year)
  vacation_days_total         numeric(5, 2) NOT NULL DEFAULT 25
                              CHECK (vacation_days_total >= 0),
  -- carry-over from previous year (positive = days still left,
  -- negative = days already advanced from this year)
  vacation_days_carried       numeric(5, 2) NOT NULL DEFAULT 0,
  -- starting overtime saldo in minutes (positive = surplus, negative = deficit)
  overtime_starting_minutes   integer NOT NULL DEFAULT 0,
  note                        text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, year)
);

CREATE INDEX IF NOT EXISTS idx_user_leave_balances_company
  ON public.user_leave_balances (company_id);

DROP TRIGGER IF EXISTS user_leave_balances_set_updated_at ON public.user_leave_balances;
CREATE TRIGGER user_leave_balances_set_updated_at
  BEFORE UPDATE ON public.user_leave_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.user_leave_balances IS
  'SCH-925 (K2-ι Q5) — per-user, per-year starting values for the '
  'Urlaub/Abwesenheit-Übersicht. Admins enter these once when onboarding a '
  'new MA so Resturlaub and Saldo-Stunden already include carry-over from '
  'the previous year.';

ALTER TABLE public.user_leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.user_leave_balances;
CREATE POLICY "tenant_isolation" ON public.user_leave_balances
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );
