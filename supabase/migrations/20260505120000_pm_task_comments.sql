-- =============================================================================
-- SCH-825 M7: PM-Plattform — Aufgaben-Kommentare + @-Mentions
-- =============================================================================
-- Comment thread per task. Mentions are stored as a flat UUID array
-- (mentioned_user_ids) so M8 (in-app notifications) can answer "who got
-- mentioned in the last N comments" with a single GIN-indexed lookup
-- without a separate join table.
--
-- RLS: workspace membership is checked transitively via tasks → projects.
-- Adding a comment-level helper pm.task_workspace_via_id() lets policies
-- read workspace once per row instead of running a 3-level subquery.
--
-- Authors can edit/delete their own comments; admins can delete anyone's
-- (moderation). Update is single-field (body): we don't expose mention
-- recomputation on edit yet — M8 may revisit.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. pm.task_comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pm.task_comments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id             UUID NOT NULL REFERENCES pm.tasks(id) ON DELETE CASCADE,
  author_user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  body                TEXT NOT NULL CHECK (length(trim(body)) > 0),
  -- Resolved at write-time by the API (server-side mention parsing). Exposing
  -- the raw array on read lets the UI underline mentions without re-parsing.
  mentioned_user_ids  UUID[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pm_task_comments_task
  ON pm.task_comments(task_id, created_at);

-- "Show me comments where I'm mentioned" (M8 in-app notifications).
CREATE INDEX IF NOT EXISTS idx_pm_task_comments_mentions
  ON pm.task_comments USING gin(mentioned_user_ids);

CREATE INDEX IF NOT EXISTS idx_pm_task_comments_author
  ON pm.task_comments(author_user_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger (reuses pm.touch_updated_at from M1)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_pm_task_comments_touch ON pm.task_comments;
CREATE TRIGGER trg_pm_task_comments_touch
  BEFORE UPDATE ON pm.task_comments
  FOR EACH ROW EXECUTE FUNCTION pm.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Workspace-via-task resolver (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
-- Comments need workspace membership through tasks → projects. Inlined as
-- a SECURITY DEFINER helper so RLS policies are one membership check, not a
-- 3-level subquery.
CREATE OR REPLACE FUNCTION pm.task_workspace_via_id(p_task_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pm, public
AS $$
  SELECT p.workspace_id
  FROM pm.tasks t
  JOIN pm.projects p ON p.id = t.project_id
  WHERE t.id = p_task_id;
$$;

GRANT EXECUTE ON FUNCTION pm.task_workspace_via_id(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON pm.task_comments TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS — pm.task_comments
-- ---------------------------------------------------------------------------
ALTER TABLE pm.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_task_comments_select ON pm.task_comments;
CREATE POLICY pm_task_comments_select ON pm.task_comments
  FOR SELECT
  TO authenticated
  USING (pm.is_workspace_member(pm.task_workspace_via_id(task_id)));

-- INSERT: must be a workspace member, and the author column must be the
-- caller. Identity is enforced server-side too, but RLS guards against any
-- API-route bug that would let one user post as another.
DROP POLICY IF EXISTS pm_task_comments_insert ON pm.task_comments;
CREATE POLICY pm_task_comments_insert ON pm.task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    pm.is_workspace_member(pm.task_workspace_via_id(task_id))
    AND author_user_id = (select auth.uid())
  );

-- UPDATE: authors can edit their own body. Admins don't get edit on others'
-- comments — moderation flow is delete + re-post.
DROP POLICY IF EXISTS pm_task_comments_update ON pm.task_comments;
CREATE POLICY pm_task_comments_update ON pm.task_comments
  FOR UPDATE
  TO authenticated
  USING (author_user_id = (select auth.uid()))
  WITH CHECK (
    author_user_id = (select auth.uid())
    AND pm.is_workspace_member(pm.task_workspace_via_id(task_id))
  );

-- DELETE: author OR workspace admin (moderation).
DROP POLICY IF EXISTS pm_task_comments_delete ON pm.task_comments;
CREATE POLICY pm_task_comments_delete ON pm.task_comments
  FOR DELETE
  TO authenticated
  USING (
    author_user_id = (select auth.uid())
    OR pm.is_workspace_admin(pm.task_workspace_via_id(task_id))
  );
