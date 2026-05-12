-- SCH-2087 — Arbeitszeitmodelle als wiederverwendbare Vorlagen.
--
-- Replaces the per-user weekly plan in `user_work_schedules` (one row per
-- weekday + user) with admin-managed templates: a Modell defines a weekly
-- shape (target hours, daily Von/Bis, default 30 min unbezahlte Pause,
-- Urlaubstage/Jahr) and is assigned to one or many user_profiles.
--
-- Two new tables + one FK on user_profiles:
--
--   work_time_models         — per-company template (name + weekly target +
--                              unpaid break + vacation days).
--   work_time_model_days     — per-weekday Von/Bis + Tagespensum, owned by
--                              a model. Same encoding as user_work_schedules
--                              (0 = Mo … 6 = So).
--   user_profiles.work_time_model_id — FK assignment; ON DELETE SET NULL so
--                              deleting a Modell doesn't strand the MA.
--
-- Backfill creates a "Persönliches Modell – {Name}" for each user that has
-- existing user_work_schedules rows and sets their work_time_model_id, so
-- time-tracking Saldi stay identical after the refactor.
--
-- RLS pattern matches SCH-918: SELECT for any same-tenant member, modify
-- only for admin/owner of the currently-selected company.

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (already created by earlier migrations — repeat
-- defensively so this file is self-contained when run standalone).
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
-- work_time_models
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_time_models (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  weekly_target_minutes   integer NOT NULL DEFAULT 0
                          CHECK (weekly_target_minutes >= 0),
  -- SCH-2087 — Standard-Pause 30 min pro Tag (unbezahlt) als Default.
  unpaid_break_minutes    integer NOT NULL DEFAULT 30
                          CHECK (unpaid_break_minutes >= 0),
  vacation_days_per_year  numeric(5, 2) NOT NULL DEFAULT 25
                          CHECK (vacation_days_per_year >= 0),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_time_models_company
  ON public.work_time_models (company_id);

DROP TRIGGER IF EXISTS work_time_models_set_updated_at ON public.work_time_models;
CREATE TRIGGER work_time_models_set_updated_at
  BEFORE UPDATE ON public.work_time_models
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.work_time_models IS
  'SCH-2087 — wiederverwendbare Arbeitszeitmodell-Vorlagen. Pro Company; '
  'admin/owner verwaltet, jeder Mitarbeiter sieht das ihm zugewiesene '
  'Modell. unpaid_break_minutes ist modellweit (nicht pro Tag).';

-- ---------------------------------------------------------------------------
-- work_time_model_days
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_time_model_days (
  model_id              uuid NOT NULL REFERENCES public.work_time_models(id) ON DELETE CASCADE,
  weekday               smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time            time,
  end_time              time,
  daily_target_minutes  integer NOT NULL DEFAULT 0
                        CHECK (daily_target_minutes >= 0),
  PRIMARY KEY (model_id, weekday),
  CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_work_time_model_days_model_id
  ON public.work_time_model_days (model_id);

COMMENT ON TABLE public.work_time_model_days IS
  'SCH-2087 — Wochentag-Slots eines work_time_models. Weekday-Encoding 0=Mo … 6=So '
  '(deckt sich mit user_work_schedules). daily_target_minutes ist die Quelle der '
  'Wahrheit fuer das Tagespensum; start_time/end_time sind informativ.';

-- ---------------------------------------------------------------------------
-- user_profiles.work_time_model_id (FK assignment)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_profiles'
        AND column_name = 'work_time_model_id'
    ) THEN
      ALTER TABLE public.user_profiles
        ADD COLUMN work_time_model_id uuid
          REFERENCES public.work_time_models(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_profiles_work_time_model_id
  ON public.user_profiles (work_time_model_id);

-- ---------------------------------------------------------------------------
-- RLS — work_time_models
-- ---------------------------------------------------------------------------
ALTER TABLE public.work_time_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wtm_select_member"  ON public.work_time_models;
DROP POLICY IF EXISTS "wtm_admin_modify"   ON public.work_time_models;

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

-- ---------------------------------------------------------------------------
-- RLS — work_time_model_days (inherits company scope via parent model)
-- ---------------------------------------------------------------------------
ALTER TABLE public.work_time_model_days ENABLE ROW LEVEL SECURITY;

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

-- ---------------------------------------------------------------------------
-- Backfill — one "Persönliches Modell – {Name}" per user with existing
-- user_work_schedules rows, scoped to the user's first company_members entry.
-- Idempotent: skips profiles that already have work_time_model_id set, and
-- skips users with no company membership (the FK is uuid → companies(id),
-- so we need a real company_id to write).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  prof          RECORD;
  active_co     text;
  new_model_id  uuid;
  weekly_total  integer;
  default_break integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_work_schedules'
  ) THEN
    RETURN;
  END IF;

  FOR prof IN
    SELECT up.id              AS profile_id,
           up.display_name    AS display_name,
           up.auth_user_id    AS auth_user_id
      FROM public.user_profiles up
     WHERE up.work_time_model_id IS NULL
       AND EXISTS (
         SELECT 1 FROM public.user_work_schedules uws WHERE uws.user_id = up.id
       )
  LOOP
    SELECT cm.company_id INTO active_co
      FROM public.company_members cm
     WHERE cm.user_id = prof.auth_user_id
     ORDER BY cm.created_at ASC
     LIMIT 1;

    IF active_co IS NULL THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(daily_target_minutes), 0)
      INTO weekly_total
      FROM public.user_work_schedules
     WHERE user_id = prof.profile_id;

    -- Pick the largest non-zero per-day Pause as the model-level break, so
    -- existing target derivations stay close. Default to 30 if none set.
    SELECT COALESCE(MAX(NULLIF(unpaid_break_minutes, 0)), 30)
      INTO default_break
      FROM public.user_work_schedules
     WHERE user_id = prof.profile_id;

    INSERT INTO public.work_time_models
      (company_id, name, weekly_target_minutes, unpaid_break_minutes, vacation_days_per_year)
    VALUES
      (active_co,
       'Persönliches Modell – ' || COALESCE(NULLIF(prof.display_name, ''), 'User'),
       weekly_total,
       default_break,
       25)
    RETURNING id INTO new_model_id;

    INSERT INTO public.work_time_model_days
      (model_id, weekday, start_time, end_time, daily_target_minutes)
    SELECT new_model_id, uws.weekday, uws.start_time, uws.end_time, uws.daily_target_minutes
      FROM public.user_work_schedules uws
     WHERE uws.user_id = prof.profile_id;

    UPDATE public.user_profiles
       SET work_time_model_id = new_model_id
     WHERE id = prof.profile_id;
  END LOOP;
END $$;
