-- SCH-2280 — Idempotent guard: ensure user_profiles.work_time_model_id exists.
--
-- The column + tables were introduced in 20260511180000_sch2087_work_time_models.sql.
-- If that migration did not apply in prod (e.g. a failed GitHub Actions run),
-- the work_time_model_id assignment from the admin UI silently fails and changes
-- are never persisted. This migration is a safe re-run of the essential DDL.
--
-- It is fully idempotent: every statement uses IF NOT EXISTS / CREATE OR REPLACE
-- / DO $$ ... IF NOT EXISTS ... END $$ so running it twice has no effect.

DO $$
BEGIN
  -- 1) work_time_models table (in case the whole SCH-2087 migration didn't run)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'work_time_models'
  ) THEN
    CREATE TABLE public.work_time_models (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id              text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      name                    text NOT NULL,
      weekly_target_minutes   integer NOT NULL DEFAULT 0
                              CHECK (weekly_target_minutes >= 0),
      unpaid_break_minutes    integer NOT NULL DEFAULT 30
                              CHECK (unpaid_break_minutes >= 0),
      vacation_days_per_year  numeric(5, 2) NOT NULL DEFAULT 25
                              CHECK (vacation_days_per_year >= 0),
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE public.work_time_models ENABLE ROW LEVEL SECURITY;
  END IF;

  -- 2) work_time_model_days table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'work_time_model_days'
  ) THEN
    CREATE TABLE public.work_time_model_days (
      model_id              uuid NOT NULL REFERENCES public.work_time_models(id) ON DELETE CASCADE,
      weekday               smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_time            time,
      end_time              time,
      daily_target_minutes  integer NOT NULL DEFAULT 0
                            CHECK (daily_target_minutes >= 0),
      PRIMARY KEY (model_id, weekday),
      CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
    );

    ALTER TABLE public.work_time_model_days ENABLE ROW LEVEL SECURITY;
  END IF;

  -- 3) user_profiles.work_time_model_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_profiles'
      AND column_name  = 'work_time_model_id'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN work_time_model_id uuid
        REFERENCES public.work_time_models(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes (all idempotent)
CREATE INDEX IF NOT EXISTS idx_work_time_models_company
  ON public.work_time_models (company_id);

CREATE INDEX IF NOT EXISTS idx_work_time_model_days_model_id
  ON public.work_time_model_days (model_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_work_time_model_id
  ON public.user_profiles (work_time_model_id);

-- RLS policies for work_time_models (idempotent DROP + CREATE)
DROP POLICY IF EXISTS "wtm_select_member" ON public.work_time_models;
DROP POLICY IF EXISTS "wtm_admin_modify"  ON public.work_time_models;

CREATE POLICY "wtm_select_member" ON public.work_time_models
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.active_company_id()));

CREATE POLICY "wtm_admin_modify" ON public.work_time_models
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT public.active_company_id())
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid())
        AND cm.company_id = (SELECT public.active_company_id())
        AND cm.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    company_id = (SELECT public.active_company_id())
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid())
        AND cm.company_id = (SELECT public.active_company_id())
        AND cm.role IN ('admin', 'owner')
    )
  );

-- RLS policies for work_time_model_days (idempotent DROP + CREATE)
DROP POLICY IF EXISTS "wtmd_select_member" ON public.work_time_model_days;
DROP POLICY IF EXISTS "wtmd_admin_modify"  ON public.work_time_model_days;

CREATE POLICY "wtmd_select_member" ON public.work_time_model_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_time_models m
      WHERE m.id = work_time_model_days.model_id
        AND m.company_id = (SELECT public.active_company_id())
    )
  );

CREATE POLICY "wtmd_admin_modify" ON public.work_time_model_days
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.work_time_models m
      JOIN public.company_members cm ON cm.company_id = m.company_id
      WHERE m.id = work_time_model_days.model_id
        AND m.company_id = (SELECT public.active_company_id())
        AND cm.user_id = (SELECT auth.uid())
        AND cm.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.work_time_models m
      JOIN public.company_members cm ON cm.company_id = m.company_id
      WHERE m.id = work_time_model_days.model_id
        AND m.company_id = (SELECT public.active_company_id())
        AND cm.user_id = (SELECT auth.uid())
        AND cm.role IN ('admin', 'owner')
    )
  );
