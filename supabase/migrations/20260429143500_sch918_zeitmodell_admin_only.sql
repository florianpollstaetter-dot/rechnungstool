-- SCH-918 (K2-γ G9): Restrict Arbeitszeitmodell editing to company admins.
--
-- Prior policies (from 20260418093458):
--   own_schedules_select: SELECT USING (true)  -- ⚠️ cross-tenant leak,
--     missed by SCH-830 because user_work_schedules has no company_id column.
--   own_schedules_modify: ALL allowed for own user_id only.
--
-- New split:
--   * SELECT: own row OR same-company admin/owner can read.
--   * INSERT/UPDATE/DELETE: only same-company admin/owner.
--
-- Same-company is resolved by walking user_work_schedules.user_id
-- (= user_profiles.id) -> user_profiles.auth_user_id -> company_members.user_id
-- -> company_id, then asserting the caller is admin/owner in that same company
-- AND that company matches the JWT-claim active_company so a multi-company
-- admin only acts inside the tenant they currently have selected.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_work_schedules') THEN
    EXECUTE 'ALTER TABLE public.user_work_schedules ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "own_schedules_select" ON public.user_work_schedules';
    EXECUTE 'DROP POLICY IF EXISTS "own_schedules_modify" ON public.user_work_schedules';
    EXECUTE 'DROP POLICY IF EXISTS "schedules_select_own_or_admin" ON public.user_work_schedules';
    EXECUTE 'DROP POLICY IF EXISTS "schedules_admin_modify" ON public.user_work_schedules';

    EXECUTE $POLICY$
      CREATE POLICY "schedules_select_own_or_admin"
        ON public.user_work_schedules
        FOR SELECT TO authenticated
        USING (
          user_id IN (
            SELECT up.id FROM public.user_profiles up
            WHERE up.auth_user_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.user_profiles up_target
            JOIN public.company_members cm_target
              ON cm_target.user_id::text = up_target.auth_user_id::text
            JOIN public.company_members cm_admin
              ON cm_admin.company_id = cm_target.company_id
            WHERE up_target.id = user_work_schedules.user_id
              AND cm_admin.user_id = (SELECT auth.uid())
              AND cm_admin.role IN ('admin', 'owner')
              AND cm_admin.company_id = (SELECT public.active_company_id())
          )
        )
    $POLICY$;

    EXECUTE $POLICY$
      CREATE POLICY "schedules_admin_modify"
        ON public.user_work_schedules
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.user_profiles up_target
            JOIN public.company_members cm_target
              ON cm_target.user_id::text = up_target.auth_user_id::text
            JOIN public.company_members cm_admin
              ON cm_admin.company_id = cm_target.company_id
            WHERE up_target.id = user_work_schedules.user_id
              AND cm_admin.user_id = (SELECT auth.uid())
              AND cm_admin.role IN ('admin', 'owner')
              AND cm_admin.company_id = (SELECT public.active_company_id())
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM public.user_profiles up_target
            JOIN public.company_members cm_target
              ON cm_target.user_id::text = up_target.auth_user_id::text
            JOIN public.company_members cm_admin
              ON cm_admin.company_id = cm_target.company_id
            WHERE up_target.id = user_work_schedules.user_id
              AND cm_admin.user_id = (SELECT auth.uid())
              AND cm_admin.role IN ('admin', 'owner')
              AND cm_admin.company_id = (SELECT public.active_company_id())
          )
        )
    $POLICY$;
  END IF;
END $$;
