-- =============================================================================
-- SCH-825 M2: PM-Plattform — Projekte
-- =============================================================================
-- Adds pm.projects under an existing workspace. Workspace-scoped, with the
-- same RLS pattern as M1: SELECT for any member, write-actions for any
-- non-guest member (M9 hardens the role split). Workspace deletion cascades.
--
-- Status workflow (Florian-Spec): planned → active → on_hold ↔ active → done.
-- Enforced as a CHECK constraint (string set), not a state machine — the UI
-- exposes valid transitions; backend trust is membership, not status.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. pm.projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pm.projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES pm.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned', 'active', 'on_hold', 'done')),
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_projects_workspace
  ON pm.projects(workspace_id);

CREATE INDEX IF NOT EXISTS idx_pm_projects_status
  ON pm.projects(workspace_id, status);

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger (reuses pm.touch_updated_at from M1)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_pm_projects_touch ON pm.projects;
CREATE TRIGGER trg_pm_projects_touch
  BEFORE UPDATE ON pm.projects
  FOR EACH ROW EXECUTE FUNCTION pm.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON pm.projects TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS — pm.projects
-- ---------------------------------------------------------------------------
-- Same defensive pattern as M1: no USING(true), all policies keyed on
-- pm.is_workspace_member(). Writes additionally require non-guest in M9.
ALTER TABLE pm.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_projects_select ON pm.projects;
CREATE POLICY pm_projects_select ON pm.projects
  FOR SELECT
  TO authenticated
  USING (pm.is_workspace_member(workspace_id));

-- INSERT: must be a member of the workspace AND created_by must be the caller.
-- Members (admin + member) can create projects in MVP; M9 will tighten guests
-- out via a separate is_workspace_writer() helper.
DROP POLICY IF EXISTS pm_projects_insert ON pm.projects;
CREATE POLICY pm_projects_insert ON pm.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    pm.is_workspace_member(workspace_id)
    AND created_by = (select auth.uid())
  );

DROP POLICY IF EXISTS pm_projects_update ON pm.projects;
CREATE POLICY pm_projects_update ON pm.projects
  FOR UPDATE
  TO authenticated
  USING (pm.is_workspace_member(workspace_id))
  WITH CHECK (pm.is_workspace_member(workspace_id));

-- DELETE: admins only — destructive enough that a non-admin shouldn't drop
-- a peer's project. Admin scope matches workspace-delete semantics in M1.
DROP POLICY IF EXISTS pm_projects_delete ON pm.projects;
CREATE POLICY pm_projects_delete ON pm.projects
  FOR DELETE
  TO authenticated
  USING (pm.is_workspace_admin(workspace_id));
