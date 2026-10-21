-- ORA-3310 — Block privilege escalation via user_profiles self-update.
--
-- The SCH-425 RLS policy `users_update_own_or_by_admin`
-- (20260421130000_sch425_admin_user_profile_rls.sql) lets a user UPDATE their
-- own user_profiles row with NO column restriction. RLS can gate which rows a
-- user may touch, but not which columns — so any logged-in user could set
-- their own `role = 'admin'` or `is_superadmin = true` and escalate to
-- tenant-admin / superadmin.
--
-- Fix: a BEFORE UPDATE trigger that rejects any change to `role` or
-- `is_superadmin` unless the connection role is service_role / postgres. The
-- legitimate admin user-management flow (src/app/api/admin/users/route.ts)
-- already performs these updates via the service-role key, so it is unaffected.
--
-- NOTE: the trigger is SECURITY INVOKER (default) on purpose — a SECURITY
-- DEFINER function would report its owner as current_user and the role check
-- would always pass.

CREATE OR REPLACE FUNCTION public.ora3310_block_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Trusted server-side roles (service-role key, DB owner) may change anything.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin THEN
    RAISE EXCEPTION
      'ORA-3310: Ändern von role/is_superadmin durch den Nutzer selbst ist nicht erlaubt';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ora3310_block_profile_privilege_escalation ON public.user_profiles;
CREATE TRIGGER ora3310_block_profile_privilege_escalation
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ora3310_block_profile_privilege_escalation();
