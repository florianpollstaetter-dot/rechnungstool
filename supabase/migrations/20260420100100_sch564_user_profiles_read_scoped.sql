-- SCH-564 F4: tighten user_profiles SELECT policy.
--
-- Before: `users_own_profile` was SELECT USING (true) — every authenticated
-- user could read every user_profile row across every tenant, including
-- email, role, accompanying text fields, etc.
--
-- After: read is allowed only when:
--   - the row is the caller's own profile, OR
--   - the profile's owner shares the caller's active company (via
--     company_members), OR
--   - the caller is a superadmin.
--
-- The superadmin check uses a SECURITY DEFINER helper to avoid recursing
-- through the same policy while evaluating it.

-- Helper: is the current caller a superadmin?
CREATE OR REPLACE FUNCTION public.user_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT is_superadmin FROM public.user_profiles WHERE auth_user_id = (select auth.uid()) LIMIT 1),
    false
  );
$$;

-- Drop every legacy permissive SELECT policy on user_profiles so the new
-- scoped policy is the only one that applies.
DROP POLICY IF EXISTS "users_own_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_read_all" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_read_same_company" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_read_scoped" ON public.user_profiles;

CREATE POLICY "user_profiles_read_scoped" ON public.user_profiles
  FOR SELECT
  USING (
    auth_user_id = (select auth.uid())
    OR public.user_is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = user_profiles.auth_user_id
        AND cm.company_id = (SELECT public.active_company_id())
    )
  );
