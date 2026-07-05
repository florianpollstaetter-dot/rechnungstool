-- =============================================================================
-- SCH-825 M3: PM-Plattform — Aufgaben (Tasks)
-- =============================================================================
-- Project-scoped tasks with title, description, optional assignee (workspace
-- member), due_date, priority, status, and a board-position used by M5
-- drag-and-drop. Subtasks (Florian's "+1 Unteraufgabe-Ebene") are modeled via
-- self-referencing parent_task_id and constrained to one level deep — root
-- tasks have parent_task_id NULL, subtasks have a non-null parent that itself
-- has parent NULL.
--
-- Status workflow (M4 Kanban columns): todo → in_progress → in_review → done.
-- Priority is an open enum: low / medium / high / urgent.
--
-- Tenant isolation: workspace-membership is checked transitively through
-- pm.projects; we don't denormalize workspace_id onto pm.tasks (avoid drift).
-- A SECURITY-DEFINER helper pm.task_workspace_id() resolves it for RLS.
--
-- custom_fields JSONB + GIN index per Florian-Spec hybrid model. Concrete
-- pm.project_fields registry comes in a Phase-2 issue; MVP-Tasks already
-- carry the column so callers don't have to alter the table later.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. pm.tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pm.tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES pm.projects(id) ON DELETE CASCADE,
  parent_task_id  UUID REFERENCES pm.tasks(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description     TEXT NOT NULL DEFAULT '',
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date        DATE,
  priority        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status          TEXT NOT NULL DEFAULT 'todo'
                  CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
  -- Float position so drag-and-drop inserts between two cards via midpoint
  -- without bulk-rewriting the column. M5 may rebalance with a periodic
  -- "compact positions" job once gaps shrink.
  position        DOUBLE PRECISION NOT NULL DEFAULT extract(epoch from now()),
  custom_fields   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pm_tasks_project
  ON pm.tasks(project_id);

-- Board view: status × position within a project. Composite covers both
-- the WHERE filter and ORDER BY in one scan.
CREATE INDEX IF NOT EXISTS idx_pm_tasks_project_status_position
  ON pm.tasks(project_id, status, position);

CREATE INDEX IF NOT EXISTS idx_pm_tasks_assignee
  ON pm.tasks(assignee_user_id)
  WHERE assignee_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pm_tasks_parent
  ON pm.tasks(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- JSONB GIN index for custom_fields lookups (Florian-Spec, Block 2.4).
CREATE INDEX IF NOT EXISTS idx_pm_tasks_custom_fields
  ON pm.tasks USING gin(custom_fields jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- 3. Subtask depth-1 invariant
-- ---------------------------------------------------------------------------
-- A task with a parent_task_id may not itself be a parent (i.e. its parent
-- must already be a root). Enforced via trigger because CHECK can't subquery.
CREATE OR REPLACE FUNCTION pm.enforce_task_depth_one()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_task_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pm.tasks
      WHERE id = NEW.parent_task_id AND parent_task_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Subtasks may only be one level deep (parent must be a root task)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_tasks_depth_one ON pm.tasks;
CREATE TRIGGER trg_pm_tasks_depth_one
  BEFORE INSERT OR UPDATE OF parent_task_id ON pm.tasks
  FOR EACH ROW EXECUTE FUNCTION pm.enforce_task_depth_one();

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger (reuses pm.touch_updated_at from M1)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_pm_tasks_touch ON pm.tasks;
CREATE TRIGGER trg_pm_tasks_touch
  BEFORE UPDATE ON pm.tasks
  FOR EACH ROW EXECUTE FUNCTION pm.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Workspace-id resolver for RLS (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
-- RLS on pm.tasks needs the workspace via the project FK. A direct subquery
-- inside a policy is RLS-safe but slow; the SECURITY DEFINER bypass + STABLE
-- caching makes it cheap. Kept STABLE (not IMMUTABLE) so transitions
-- (project moved between workspaces) remain consistent.
CREATE OR REPLACE FUNCTION pm.task_workspace_id(p_project_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pm, public
AS $$
  SELECT workspace_id FROM pm.projects WHERE id = p_project_id;
$$;

GRANT EXECUTE ON FUNCTION pm.task_workspace_id(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON pm.tasks TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS — pm.tasks
-- ---------------------------------------------------------------------------
-- Same defensive pattern as M1/M2: no USING(true), one policy per action,
-- all gated on workspace membership resolved through the project FK.
ALTER TABLE pm.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_tasks_select ON pm.tasks;
CREATE POLICY pm_tasks_select ON pm.tasks
  FOR SELECT
  TO authenticated
  USING (pm.is_workspace_member(pm.task_workspace_id(project_id)));

DROP POLICY IF EXISTS pm_tasks_insert ON pm.tasks;
CREATE POLICY pm_tasks_insert ON pm.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    pm.is_workspace_member(pm.task_workspace_id(project_id))
    AND created_by = (select auth.uid())
  );

DROP POLICY IF EXISTS pm_tasks_update ON pm.tasks;
CREATE POLICY pm_tasks_update ON pm.tasks
  FOR UPDATE
  TO authenticated
  USING (pm.is_workspace_member(pm.task_workspace_id(project_id)))
  WITH CHECK (pm.is_workspace_member(pm.task_workspace_id(project_id)));

DROP POLICY IF EXISTS pm_tasks_delete ON pm.tasks;
CREATE POLICY pm_tasks_delete ON pm.tasks
  FOR DELETE
  TO authenticated
  USING (pm.is_workspace_member(pm.task_workspace_id(project_id)));
