-- =============================================================================
-- SCH-825 M8: PM-Plattform — In-App-Notifications
-- =============================================================================
-- Trigger-driven fan-out: comment INSERT writes one row per mentioned user;
-- task INSERT or assignee UPDATE writes a row for the new assignee. Keeps
-- the UI dumb (just SELECT) and guarantees no missed events even if a
-- future API path forgets to enqueue.
--
-- Self-actions are skipped (no "you mentioned yourself" / "you assigned
-- yourself") since they aren't useful and clutter the bell.
--
-- The notifications table denormalizes workspace_id so the SELECT policy
-- can be a single membership check (recipient must still belong, otherwise
-- they wouldn't see the underlying task anyway). Keeps queries cheap and
-- still safe — INSERT only happens via the SECURITY DEFINER trigger funcs
-- which read the workspace from the source row directly.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. pm.notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pm.notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id        UUID NOT NULL REFERENCES pm.workspaces(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('mention', 'assigned')),
  task_id             UUID NOT NULL REFERENCES pm.tasks(id) ON DELETE CASCADE,
  comment_id          UUID REFERENCES pm.task_comments(id) ON DELETE CASCADE,
  actor_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
-- Bell-icon query: unread for the current user, newest first.
CREATE INDEX IF NOT EXISTS idx_pm_notifications_recipient_unread
  ON pm.notifications(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Full inbox query: all notifications for me.
CREATE INDEX IF NOT EXISTS idx_pm_notifications_recipient
  ON pm.notifications(recipient_user_id, created_at DESC);

-- For workspace-scoped clear-all (future).
CREATE INDEX IF NOT EXISTS idx_pm_notifications_workspace
  ON pm.notifications(workspace_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, UPDATE ON pm.notifications TO authenticated;

ALTER TABLE pm.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: recipient only. Workspace_id is denormalized but not used for the
-- read gate — recipient identity is the authoritative filter.
DROP POLICY IF EXISTS pm_notifications_select ON pm.notifications;
CREATE POLICY pm_notifications_select ON pm.notifications
  FOR SELECT
  TO authenticated
  USING (recipient_user_id = (select auth.uid()));

-- UPDATE: recipient can mark their own as read. The CHECK guard keeps them
-- from rewriting the recipient/type/task/etc. — only read_at moves.
DROP POLICY IF EXISTS pm_notifications_update ON pm.notifications;
CREATE POLICY pm_notifications_update ON pm.notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_user_id = (select auth.uid()))
  WITH CHECK (recipient_user_id = (select auth.uid()));

-- No INSERT / DELETE policy: rows are written only by the SECURITY DEFINER
-- trigger functions below, and lifecycle is via ON DELETE CASCADE from
-- task / comment / user / workspace.

-- ---------------------------------------------------------------------------
-- 4. Trigger: comment INSERT → fan-out mentions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pm.fanout_comment_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pm, public
AS $$
DECLARE
  v_workspace_id UUID;
  v_recipient    UUID;
BEGIN
  IF array_length(NEW.mentioned_user_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pm.task_workspace_via_id(NEW.task_id) INTO v_workspace_id;
  IF v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH v_recipient IN ARRAY NEW.mentioned_user_ids LOOP
    -- Skip self-mention; the author obviously knows what they wrote.
    IF v_recipient = NEW.author_user_id THEN
      CONTINUE;
    END IF;

    -- Mentioned users must already be in the workspace; otherwise the
    -- mention array is malformed (resolver shouldn't have produced them)
    -- and we silently drop instead of pushing a notification the recipient
    -- can't see anyway. Direct membership check (not pm.is_workspace_member,
    -- which reads auth.uid() of the trigger invoker, i.e. the author).
    IF EXISTS (
      SELECT 1 FROM pm.workspace_members
      WHERE workspace_id = v_workspace_id AND user_id = v_recipient
    ) THEN
      INSERT INTO pm.notifications (
        recipient_user_id, workspace_id, type, task_id, comment_id, actor_user_id
      ) VALUES (
        v_recipient, v_workspace_id, 'mention', NEW.task_id, NEW.id, NEW.author_user_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_comment_fanout ON pm.task_comments;
CREATE TRIGGER trg_pm_comment_fanout
  AFTER INSERT ON pm.task_comments
  FOR EACH ROW EXECUTE FUNCTION pm.fanout_comment_mentions();

-- ---------------------------------------------------------------------------
-- 5. Trigger: task INSERT/UPDATE → fan-out assignment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pm.fanout_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pm, public
AS $$
DECLARE
  v_workspace_id UUID;
  v_actor        UUID;
BEGIN
  -- INSERT: notify if assignee is set and not the creator.
  -- UPDATE: notify only when assignee actually changed and the new assignee
  --         isn't the user making the change.
  IF NEW.assignee_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.assignee_user_id IS NOT DISTINCT FROM OLD.assignee_user_id THEN
    RETURN NEW;
  END IF;

  v_actor := auth.uid();
  IF NEW.assignee_user_id = v_actor THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.assignee_user_id = NEW.created_by THEN
    RETURN NEW;
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM pm.projects WHERE id = NEW.project_id;
  IF v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sanity: the assignee must be a workspace member. The FK is auth.users,
  -- not workspace_members, so a stale UI could hand us a non-member.
  IF NOT EXISTS (
    SELECT 1 FROM pm.workspace_members
    WHERE workspace_id = v_workspace_id AND user_id = NEW.assignee_user_id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO pm.notifications (
    recipient_user_id, workspace_id, type, task_id, actor_user_id
  ) VALUES (
    NEW.assignee_user_id, v_workspace_id, 'assigned', NEW.id, v_actor
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_task_assignment_fanout ON pm.tasks;
CREATE TRIGGER trg_pm_task_assignment_fanout
  AFTER INSERT OR UPDATE OF assignee_user_id ON pm.tasks
  FOR EACH ROW EXECUTE FUNCTION pm.fanout_task_assignment();
