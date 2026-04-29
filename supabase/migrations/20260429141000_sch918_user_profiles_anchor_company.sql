-- SCH-918 (K2-γ G5): Anchor company for multi-company employees.
--
-- A user can belong to N companies via company_members (M:N). The anchor
-- company is the single "home" company shown in their user profile —
-- typically the company that hired them. Nullable so existing users stay
-- valid; the admin user-create flow sets it explicitly when creating MA.
--
-- ON DELETE SET NULL: dropping a company should not cascade-delete profiles.

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
        AND column_name = 'anchor_company_id'
    ) THEN
      ALTER TABLE public.user_profiles
        ADD COLUMN anchor_company_id TEXT
          REFERENCES public.companies(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_profiles_anchor_company_id
  ON public.user_profiles(anchor_company_id)
  WHERE anchor_company_id IS NOT NULL;
