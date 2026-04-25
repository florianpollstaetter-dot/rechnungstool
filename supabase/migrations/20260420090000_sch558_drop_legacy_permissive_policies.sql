-- SCH-558 follow-up: drop legacy permissive policies on user_profiles that
-- allowed any authenticated user to read/write any user profile across tenants.
-- Reported by board: users created in one company appeared in other companies.
-- Root cause: "Auth users can manage user_profiles" FOR ALL USING (true) WITH CHECK (true)
-- + "users_own_profile" SELECT USING (true).
-- New policies enforce: own profile OR same company (via company_members join).

DROP POLICY IF EXISTS "Auth users can manage user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS users_own_profile ON public.user_profiles;

DROP POLICY IF EXISTS user_profiles_select_self_or_same_company ON public.user_profiles;
CREATE POLICY user_profiles_select_self_or_same_company ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = user_profiles.auth_user_id
        AND cm.company_id = (SELECT public.active_company_id())
    )
  );

DROP POLICY IF EXISTS users_insert_own ON public.user_profiles;
CREATE POLICY users_insert_own ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS users_update_own ON public.user_profiles;
CREATE POLICY users_update_own ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS users_delete_own ON public.user_profiles;
CREATE POLICY users_delete_own ON public.user_profiles
  FOR DELETE TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));
