-- SCH-921 (K2-J3): "intern / verrechenbar" toggle on projects.
--
-- The new-project popup in the time tracker (K2-J3) needs to flag whether
-- a manually-created project is internal (e.g. "Recruiting", "Sprint
-- Planning") or billable (a real client engagement). Default is `true`
-- (billable) so existing projects keep their behavior — any project that
-- was auto-created from a Quote was always billable by definition.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'projects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'projects'
        AND column_name = 'is_billable'
    ) THEN
      ALTER TABLE public.projects
        ADD COLUMN is_billable BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.projects.is_billable IS
  'SCH-921 K2-J3 — false marks a project as internal (e.g. internal '
  'admin/recruiting time). New time entries should default `billable` '
  'from this flag when no quote is linked.';
