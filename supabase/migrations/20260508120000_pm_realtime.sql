-- =============================================================================
-- SCH-825 M10: PM-Plattform — Supabase Realtime
-- =============================================================================
-- Subscribes the three live PM tables (tasks, task_comments, notifications)
-- to the `supabase_realtime` publication. Realtime delivers UPDATE/DELETE
-- payloads using REPLICA IDENTITY: the default is just the primary key, but
-- our client filters use project_id / task_id / recipient_user_id, so we
-- need FULL identity for those columns to be present on update/delete
-- payloads. Using FULL is fine at PM-MVP scale (tasks are <50K rows on the
-- spec ceiling; FULL writes WAL slightly larger but is required for client
-- filters on non-PK columns).
--
-- pm.workspaces / pm.workspace_members / pm.projects don't get realtime in
-- M10 — list pages reload on navigation and the spec only calls out
-- "real-time updates for other users" on tasks. Phase 2 may extend.
-- =============================================================================

ALTER TABLE pm.tasks REPLICA IDENTITY FULL;
ALTER TABLE pm.task_comments REPLICA IDENTITY FULL;
ALTER TABLE pm.notifications REPLICA IDENTITY FULL;

-- ALTER PUBLICATION ... ADD TABLE is not idempotent — it errors on
-- duplicate. Wrap each in a DO block that swallows duplicate_object.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pm.tasks;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pm.task_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pm.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
