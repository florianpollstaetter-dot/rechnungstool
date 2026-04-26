-- =============================================================================
-- SCH-825 M1: PM-Plattform — Workspaces + Workspace-Members
-- =============================================================================
-- Creates the `pm` schema (isolated from public Orange-Octo tables) and the
-- two M1 tables: pm.workspaces and pm.workspace_members.
--
-- Tenant model: a workspace is the PM-tenant root. Membership is the auth
-- gate. Roles are 'admin' | 'member' | 'guest' (M9 will harden guest writes).
--
-- RLS approach (defensive — see SCH-830/SCH-425 incidents):
--   * No permissive USING(true) policies. Postgres OR's policies for the same
--     role, so any USING(true) nullifies tenant filtering.
--   * Membership lookups go through SECURITY DEFINER helper functions to
--     avoid recursive RLS evaluation when a policy on workspace_members
--     itself queries workspace_members.
--   * Each table has at most one SELECT policy and one write-policy per
--     command, all keyed on pm.is_workspace_member().
--
-- Idempotent: schema/tables use IF NOT EXISTS, policies are dropped before
-- create, helper functions use CREATE OR REPLACE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS pm;

GRANT USAGE ON SCHEMA pm TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2. pm.workspaces
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pm.workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_workspaces_created_by
  ON pm.workspaces(created_by);

-- ---------------------------------------------------------------------------
-- 3. pm.workspace_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pm.workspace_members (
  workspace_id  UUID NOT NULL REFERENCES pm.workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('admin', 'member', 'guest')),
  invited_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pm_workspace_members_user
  ON pm.workspace_members(user_id);

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pm.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_workspaces_touch ON pm.workspaces;
CREATE TRIGGER trg_pm_workspaces_touch
  BEFORE UPDATE ON pm.workspaces
  FOR EACH ROW EXECUTE FUNCTION pm.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Membership helpers (SECURITY DEFINER to bypass RLS recursion)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pm.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pm, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pm.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = (select auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION pm.is_workspace_admin(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pm, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pm.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = (select auth.uid())
      AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION pm.is_workspace_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION pm.is_workspace_admin(UUID)  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Auto-add creator as admin trigger
-- ---------------------------------------------------------------------------
-- When a workspace is created, the creator must immediately appear as an
-- 'admin' member so they can see/edit it under RLS. Trigger runs AFTER INSERT
-- (so the workspace row exists for the FK) and uses the workspace's own
-- created_by, not auth.uid(), so service-role inserts also work correctly.
CREATE OR REPLACE FUNCTION pm.add_creator_as_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pm, public
AS $$
BEGIN
  INSERT INTO pm.workspace_members (workspace_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.created_by, 'admin', NEW.created_by)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_workspaces_seed_admin ON pm.workspaces;
CREATE TRIGGER trg_pm_workspaces_seed_admin
  AFTER INSERT ON pm.workspaces
  FOR EACH ROW EXECUTE FUNCTION pm.add_creator_as_admin();

-- ---------------------------------------------------------------------------
-- 7. Grants — RLS still enforces row visibility, but tables need base grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON pm.workspaces        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pm.workspace_members TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS — pm.workspaces
-- ---------------------------------------------------------------------------
ALTER TABLE pm.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_workspaces_select ON pm.workspaces;
CREATE POLICY pm_workspaces_select ON pm.workspaces
  FOR SELECT
  TO authenticated
  USING (pm.is_workspace_member(id));

-- Anyone authenticated can create a workspace; the trigger seeds them as admin.
-- We additionally require created_by = auth.uid() so callers can't impersonate
-- another user as the creator.
DROP POLICY IF EXISTS pm_workspaces_insert ON pm.workspaces;
CREATE POLICY pm_workspaces_insert ON pm.workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS pm_workspaces_update ON pm.workspaces;
CREATE POLICY pm_workspaces_update ON pm.workspaces
  FOR UPDATE
  TO authenticated
  USING (pm.is_workspace_admin(id))
  WITH CHECK (pm.is_workspace_admin(id));

DROP POLICY IF EXISTS pm_workspaces_delete ON pm.workspaces;
CREATE POLICY pm_workspaces_delete ON pm.workspaces
  FOR DELETE
  TO authenticated
  USING (pm.is_workspace_admin(id));

-- ---------------------------------------------------------------------------
-- 9. RLS — pm.workspace_members
-- ---------------------------------------------------------------------------
ALTER TABLE pm.workspace_members ENABLE ROW LEVEL SECURITY;

-- Members can see all rows in workspaces they belong to (so the members page
-- works). The helper is SECURITY DEFINER → no infinite recursion against
-- this same table.
DROP POLICY IF EXISTS pm_workspace_members_select ON pm.workspace_members;
CREATE POLICY pm_workspace_members_select ON pm.workspace_members
  FOR SELECT
  TO authenticated
  USING (pm.is_workspace_member(workspace_id));

-- INSERT: admins of the workspace OR the creator-trigger path. The trigger is
-- SECURITY DEFINER so it bypasses RLS — no explicit allowance needed for it.
-- For ordinary inserts we require the caller to be admin.
DROP POLICY IF EXISTS pm_workspace_members_insert ON pm.workspace_members;
CREATE POLICY pm_workspace_members_insert ON pm.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (pm.is_workspace_admin(workspace_id));

DROP POLICY IF EXISTS pm_workspace_members_update ON pm.workspace_members;
CREATE POLICY pm_workspace_members_update ON pm.workspace_members
  FOR UPDATE
  TO authenticated
  USING (pm.is_workspace_admin(workspace_id))
  WITH CHECK (pm.is_workspace_admin(workspace_id));

-- DELETE: admins remove anyone, OR a member may remove their own row (leave).
DROP POLICY IF EXISTS pm_workspace_members_delete ON pm.workspace_members;
CREATE POLICY pm_workspace_members_delete ON pm.workspace_members
  FOR DELETE
  TO authenticated
  USING (
    pm.is_workspace_admin(workspace_id)
    OR user_id = (select auth.uid())
  );
