-- SCH-482: Force password change on next login
--
-- Adds `must_change_password` flag on user_profiles. When set to true,
-- the app redirects the user to /force-password-change after sign-in.
-- The superadmin console flips this flag when it hands out a temporary
-- password. The forced change page clears the flag once a new password
-- is saved.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
