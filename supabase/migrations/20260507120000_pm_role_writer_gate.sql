-- =============================================================================
-- SCH-825 M9: PM-Plattform — 3-Stufen-Rollen, Guest = Read-Only
-- =============================================================================
-- M1 already has admin/member/guest in pm.workspace_members.role. M2/M3/M7
-- write policies were keyed on pm.is_workspace_member() which lets guests
-- write — wrong by spec. This migration adds pm.is_workspace_writer()
-- (admin OR member) and re-points every INSERT/UPDATE/DELETE policy on
-- pm.projects, pm.tasks, pm.task_comments to it. SELECT stays member-keyed
-- so guests can still read everything in their workspace.
--
-- DELETE on pm.projects already required admin and stays that way; only
-- the member-write paths needed tightening.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. pm.is_workspace_writer() — admin OR member
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pm.is_workspace_writer(p_workspace_id UUID)
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
      AND role IN ('admin', 'member')
  );
$$;

GRANT EXECUTE ON FUNCTION pm.is_workspace_writer(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. pm.projects — re-point INSERT/UPDATE; DELETE already admin-only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pm_projects_insert ON pm.projects;
CREATE POLICY pm_projects_insert ON pm.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    pm.is_workspace_writer(workspace_id)
    AND created_by = (select auth.uid())
  );

DROP POLICY IF EXISTS pm_projects_update ON pm.projects;
CREATE POLICY pm_projects_update ON pm.projects
  FOR UPDATE
  TO authenticated
  USING (pm.is_workspace_writer(workspace_id))
  WITH CHECK (pm.is_workspace_writer(workspace_id));

-- ---------------------------------------------------------------------------
-- 3. pm.tasks — re-point INSERT/UPDATE/DELETE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pm_tasks_insert ON pm.tasks;
CREATE POLICY pm_tasks_insert ON pm.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    pm.is_workspace_writer(pm.task_workspace_id(project_id))
    AND created_by = (select auth.uid())
  );

DROP POLICY IF EXISTS pm_tasks_update ON pm.tasks;
CREATE POLICY pm_tasks_update ON pm.tasks
  FOR UPDATE
  TO authenticated
  USING (pm.is_workspace_writer(pm.task_workspace_id(project_id)))
  WITH CHECK (pm.is_workspace_writer(pm.task_workspace_id(project_id)));

DROP POLICY IF EXISTS pm_tasks_delete ON pm.tasks;
CREATE POLICY pm_tasks_delete ON pm.tasks
  FOR DELETE
  TO authenticated
  USING (pm.is_workspace_writer(pm.task_workspace_id(project_id)));

-- ---------------------------------------------------------------------------
-- 4. pm.task_comments — re-point INSERT (UPDATE/DELETE already author-keyed)
-- ---------------------------------------------------------------------------
-- INSERT was member-keyed. Guests should NOT be able to comment.
DROP POLICY IF EXISTS pm_task_comments_insert ON pm.task_comments;
CREATE POLICY pm_task_comments_insert ON pm.task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    pm.is_workspace_writer(pm.task_workspace_via_id(task_id))
    AND author_user_id = (select auth.uid())
  );

-- UPDATE: author-keyed (unchanged from M7) — but if a member is demoted to
-- guest mid-edit, the additional writer guard prevents stealth edits.
DROP POLICY IF EXISTS pm_task_comments_update ON pm.task_comments;
CREATE POLICY pm_task_comments_update ON pm.task_comments
  FOR UPDATE
  TO authenticated
  USING (author_user_id = (select auth.uid()))
  WITH CHECK (
    author_user_id = (select auth.uid())
    AND pm.is_workspace_writer(pm.task_workspace_via_id(task_id))
  );

-- DELETE: author OR admin (moderation) — unchanged from M7. Admin path
-- intentionally NOT widened to "writer" — moderation must stay narrow.
