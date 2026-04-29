-- SCH-425: Extend user_profiles RLS so company admins can create/update/delete
-- user_profiles for members of their own company (needed for admin user-creation
-- flow which previously relied on the legacy permissive policy that was dropped
-- in 20260420090000_sch558_drop_legacy_permissive_policies.sql).
--
-- Board repro: "createUserProfile failed: new row violates row-level security
-- policy for table 'user_profiles'" when an admin creates a new user.

DROP POLICY IF EXISTS users_insert_own ON public.user_profiles;
DROP POLICY IF EXISTS users_insert_own_or_by_admin ON public.user_profiles;
CREATE POLICY users_insert_own_or_by_admin ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid())
        AND cm.role IN ('admin', 'owner')
        AND cm.company_id = (SELECT public.active_company_id())
    )
  );

DROP POLICY IF EXISTS users_update_own ON public.user_profiles;
DROP POLICY IF EXISTS users_update_own_or_by_admin ON public.user_profiles;
CREATE POLICY users_update_own_or_by_admin ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_members cm_admin
      JOIN public.company_members cm_target
        ON cm_target.company_id = cm_admin.company_id
      WHERE cm_admin.user_id = (SELECT auth.uid())
        AND cm_admin.role IN ('admin', 'owner')
        AND cm_admin.company_id = (SELECT public.active_company_id())
        AND cm_target.user_id = user_profiles.auth_user_id
    )
  )
  WITH CHECK (
    auth_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_members cm_admin
      JOIN public.company_members cm_target
        ON cm_target.company_id = cm_admin.company_id
      WHERE cm_admin.user_id = (SELECT auth.uid())
        AND cm_admin.role IN ('admin', 'owner')
        AND cm_admin.company_id = (SELECT public.active_company_id())
        AND cm_target.user_id = user_profiles.auth_user_id
    )
  );

DROP POLICY IF EXISTS users_delete_own ON public.user_profiles;
DROP POLICY IF EXISTS users_delete_own_or_by_admin ON public.user_profiles;
CREATE POLICY users_delete_own_or_by_admin ON public.user_profiles
  FOR DELETE TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_members cm_admin
      JOIN public.company_members cm_target
        ON cm_target.company_id = cm_admin.company_id
      WHERE cm_admin.user_id = (SELECT auth.uid())
        AND cm_admin.role IN ('admin', 'owner')
        AND cm_admin.company_id = (SELECT public.active_company_id())
        AND cm_target.user_id = user_profiles.auth_user_id
    )
  );
