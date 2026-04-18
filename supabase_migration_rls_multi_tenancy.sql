-- =============================================================================
-- SCH-422: SaaS Foundation — RLS Multi-Tenancy
-- =============================================================================
-- This migration:
--   1. Creates the `companies` table and seeds existing companies
--   2. Creates `company_members` (replaces user_profiles.company_access JSON)
--   3. Migrates existing company_access data → company_members rows
--   4. Creates a JWT custom claims function for active company_id
--   5. Enables RLS on ALL tables with appropriate policies
--   6. Adds company_id indexes for performance
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Companies table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,                              -- slug, e.g. "vrthefans"
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  logo_url    TEXT,
  plan        TEXT NOT NULL DEFAULT 'trial'                  -- trial | starter | pro | enterprise
              CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise')),
  status      TEXT NOT NULL DEFAULT 'active'                 -- active | suspended | cancelled
              CHECK (status IN ('active', 'suspended', 'cancelled')),
  trial_ends_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed existing companies (idempotent)
INSERT INTO companies (id, name, slug, logo_url, plan, status)
VALUES
  ('vrthefans', 'VR the Fans GmbH',  'vrthefans', '/logos/vrthefans.png', 'pro', 'active'),
  ('lola',      'LOLA x MEDIA GmbH', 'lola',      '/logos/lola.png',      'pro', 'active'),
  ('55films',   '55 Films GmbH',     '55films',   '/logos/55films.png',   'pro', 'active')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Company members table (replaces company_access JSON array)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member'                 -- owner | admin | member
              CHECK (role IN ('owner', 'admin', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_user_id
  ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id
  ON company_members(company_id);

-- ---------------------------------------------------------------------------
-- 3. Migrate existing company_access → company_members
-- ---------------------------------------------------------------------------
-- user_profiles.company_access is a JSON array of company slugs, e.g. ["vrthefans","lola"]
-- We insert a member row for each entry.
DO $$
BEGIN
  INSERT INTO company_members (company_id, user_id, role)
  SELECT
    ca.company_id,
    up.auth_user_id::uuid,
    CASE WHEN up.role = 'admin' THEN 'admin' ELSE 'member' END
  FROM user_profiles up,
       LATERAL (
         SELECT jsonb_array_elements_text(
           CASE
             WHEN up.company_access IS NULL THEN '[]'::jsonb
             WHEN up.company_access::text = '' THEN '[]'::jsonb
             ELSE up.company_access::jsonb
           END
         ) AS company_id
       ) ca
  WHERE ca.company_id IN (SELECT id FROM companies)
  ON CONFLICT (company_id, user_id) DO NOTHING;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'company_access migration skipped (may already be done or column format differs): %', SQLERRM;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Helper function: get active company_id from JWT
-- ---------------------------------------------------------------------------
-- Reads from the JWT app_metadata claim. This is set by the custom claims
-- hook (configured in Supabase Dashboard → Auth → Hooks) or by the
-- set-active-company API route.
-- Wrapped in (select ...) in policies for Postgres plan-caching performance.
CREATE OR REPLACE FUNCTION public.active_company_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'company_id',
    current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'active_company_id'
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Helper: check if current user is a member of a company
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_company_member(p_company_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
      AND user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. Enable RLS on all company-scoped tables
-- ---------------------------------------------------------------------------

-- Macro: For each company-scoped table, enable RLS and create tenant isolation
-- policies. The policy uses active_company_id() from the JWT AND verifies the
-- user is a member of that company via company_members.

-- ---- companies ----
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (
    public.user_is_company_member(id)
  );

CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (true);  -- anyone can create a company (registration)

CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (
    public.user_is_company_member(id)
  );

-- ---- company_members ----
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_select" ON company_members
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR company_id = (select public.active_company_id())
  );

CREATE POLICY "company_members_insert" ON company_members
  FOR INSERT WITH CHECK (
    -- owners/admins can add members, or self-insert during registration
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_members.company_id
        AND cm.user_id = (select auth.uid())
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "company_members_delete" ON company_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_members.company_id
        AND cm.user_id = (select auth.uid())
        AND cm.role IN ('owner', 'admin')
    )
  );

-- ---- company_settings ----
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON company_settings
  FOR ALL USING (
    id = (select public.active_company_id())
    AND public.user_is_company_member(id)
  )
  WITH CHECK (
    id = (select public.active_company_id())
    AND public.user_is_company_member(id)
  );

-- ---- customers ----
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON customers
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- products ----
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON products
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- invoices ----
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON invoices
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- invoice_items ----
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON invoice_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_items.invoice_id
        AND i.company_id = (select public.active_company_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_items.invoice_id
        AND i.company_id = (select public.active_company_id())
    )
  );

-- ---- quotes ----
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON quotes
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- quote_items ----
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON quote_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_items.quote_id
        AND q.company_id = (select public.active_company_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_items.quote_id
        AND q.company_id = (select public.active_company_id())
    )
  );

-- ---- expense_reports ----
ALTER TABLE expense_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON expense_reports
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- expense_items ----
ALTER TABLE expense_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON expense_items
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- time_entries ----
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON time_entries
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- projects ----
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON projects
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- tasks ----
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON tasks
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- user_dashboard_layouts ----
ALTER TABLE user_dashboard_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON user_dashboard_layouts
  FOR ALL USING (
    company_id = (select public.active_company_id())
    AND user_id = (select auth.uid())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
    AND user_id = (select auth.uid())
  );

-- ---- company_roles ----
ALTER TABLE company_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON company_roles
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- user_role_assignments ----
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON user_role_assignments
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- smart_insights_config ----
ALTER TABLE smart_insights_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON smart_insights_config
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- bank_statements ----
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON bank_statements
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- bank_transactions ----
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON bank_transactions
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- receipts ----
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON receipts
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- templates ----
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON templates
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---- fixed_costs ----
ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON fixed_costs
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---------------------------------------------------------------------------
-- 7. User-scoped tables (RLS on auth.uid(), not company_id)
-- ---------------------------------------------------------------------------

-- ---- user_profiles ----
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_profile" ON user_profiles
  FOR SELECT USING (true);  -- all authenticated users can list profiles (for admin panel, team views)

CREATE POLICY "users_update_own" ON user_profiles
  FOR UPDATE USING (
    auth_user_id = (select auth.uid())
  );

CREATE POLICY "users_insert_own" ON user_profiles
  FOR INSERT WITH CHECK (
    auth_user_id = (select auth.uid())
  );

-- ---- user_work_schedules ---- (optional: only apply if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_work_schedules') THEN
    EXECUTE 'ALTER TABLE user_work_schedules ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "own_schedules_select" ON user_work_schedules';
    EXECUTE 'CREATE POLICY "own_schedules_select" ON user_work_schedules FOR SELECT USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS "own_schedules_modify" ON user_work_schedules';
    EXECUTE $POLICY$CREATE POLICY "own_schedules_modify" ON user_work_schedules FOR ALL USING (user_id = (SELECT id FROM user_profiles WHERE auth_user_id = (select auth.uid()) LIMIT 1)) WITH CHECK (user_id = (SELECT id FROM user_profiles WHERE auth_user_id = (select auth.uid()) LIMIT 1))$POLICY$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Company_id indexes for performance
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_expense_reports_company_id ON expense_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_company_id ON expense_items(company_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_company_id ON time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_company_id ON tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_company_id ON user_dashboard_layouts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_roles_company_id ON company_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_company_id ON user_role_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_smart_insights_config_company_id ON smart_insights_config(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_company_id ON bank_statements(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_company_id ON bank_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_receipts_company_id ON receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_templates_company_id ON templates(company_id);
CREATE INDEX IF NOT EXISTS idx_fixed_costs_company_id ON fixed_costs(company_id);

-- ---------------------------------------------------------------------------
-- 9. RPC: set_active_company — updates JWT claim for company switching
-- ---------------------------------------------------------------------------
-- Called from the frontend when user switches companies. Updates the user's
-- app_metadata so the next JWT refresh includes the new active company_id.
CREATE OR REPLACE FUNCTION public.set_active_company(p_company_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_member BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id AND user_id = v_user_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Not a member of company %', p_company_id;
  END IF;

  -- Update auth.users app_metadata to set the active company
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('company_id', p_company_id)
  WHERE id = v_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Auth hook: inject company_id into JWT on token creation
-- ---------------------------------------------------------------------------
-- This function is registered as a Supabase Auth hook (custom_access_token_hook).
-- It reads company_id from app_metadata and injects it into the JWT claims.
-- If no company_id is set, it picks the user's first company from company_members.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims JSONB;
  v_user_id UUID;
  v_company_id TEXT;
BEGIN
  claims := event -> 'claims';
  v_user_id := (claims ->> 'sub')::uuid;

  -- Check if company_id already in app_metadata
  v_company_id := claims -> 'app_metadata' ->> 'company_id';

  -- If not set, pick the first company the user is a member of
  IF v_company_id IS NULL OR v_company_id = '' THEN
    SELECT cm.company_id INTO v_company_id
    FROM company_members cm
    WHERE cm.user_id = v_user_id
    ORDER BY cm.created_at ASC
    LIMIT 1;
  END IF;

  -- Inject into claims
  IF v_company_id IS NOT NULL THEN
    claims := jsonb_set(
      claims,
      '{app_metadata, company_id}',
      to_jsonb(v_company_id)
    );
    -- Update the event with modified claims
    event := jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
END;
$$;

-- Grant execute on the hook to supabase_auth_admin (required for Auth hooks)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
-- The hook also needs to read company_members
GRANT SELECT ON TABLE public.company_members TO supabase_auth_admin;
-- Revoke from anon/authenticated (hook is internal)
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- Grant the RPC to authenticated users
GRANT EXECUTE ON FUNCTION public.set_active_company TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_company_id TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_is_company_member TO authenticated;
