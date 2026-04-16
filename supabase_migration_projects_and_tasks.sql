-- Migration: Projects + Tasks foundation (SCH-366 — Modul 4 Backend)
-- Self-contained — Reihenfolge gegenüber anderen Migrationen egal.
--
-- Introduces structured Project/Task ebenen, extends time_entries with
-- optional project_id / task_id FKs, and adds reporting-oriented indexes.
--
-- Backward-compat: time_entries.project_label (TEXT) BLEIBT bestehen — die
-- bestehende Listen-UI und Analytics nutzen es weiterhin. project_id /
-- task_id sind nullable, damit Altdaten nicht gebrochen werden. Ein späterer
-- Migrations-Pass kann die existierenden Einträge auf die neuen FKs mappen.
--
-- Scope (parallel zum Founding Engineer auf SCH-367 — UI-frei):
--   1. public.set_updated_at   — CREATE OR REPLACE (idempotent, selbst wenn
--                                v2-Migration sie bereits definiert hat)
--   2. projects-Tabelle        — company-scoped, optional quote_id
--   3. tasks-Tabelle           — project-scoped, assignee & estimate
--   4. time_entries.project_id + task_id (nullable)
--   5. Reporting-Indexes (company + user + start_time, company + project_id)
--   6. updated_at-Trigger auf projects / tasks

-- 0. updated_at trigger helper (idempotent, same shape as v2-migration) -------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. projects -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  name       text NOT NULL,
  color      text,
  status     text NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  quote_id   uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_company
  ON public.projects (company_id);
CREATE INDEX IF NOT EXISTS idx_projects_quote
  ON public.projects (quote_id)
  WHERE quote_id IS NOT NULL;
-- Ein Projekt pro Angebot (nur wenn quote_id gesetzt ist).
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_quote_id
  ON public.projects (quote_id)
  WHERE quote_id IS NOT NULL;

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.projects IS
  'Structured Projekt-Ebene für Zeiterfassung 2.0 (SCH-366, Modul 4). '
  'Company-scoped. Optionaler quote_id-FK für Auto-Anlage aus freigegebenen '
  'Angeboten. time_entries.project_label bleibt für Altdaten bestehen; neue '
  'Einträge sollen über project_id referenzieren.';

-- 2. tasks --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        text NOT NULL,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  assignee_user_id  uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  due_date          date,
  estimated_hours   numeric(10, 2) CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  position          integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project
  ON public.tasks (project_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_company
  ON public.tasks (company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee
  ON public.tasks (assignee_user_id)
  WHERE assignee_user_id IS NOT NULL;

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.tasks IS
  'Task-Ebene unterhalb Projekt (SCH-366, Modul 4). time_entries.task_id '
  'soll künftig auf tasks.id zeigen; ein Default-Task "Allgemein" wird '
  'beim Auto-Anlage-Flow aus Quote-Positionen befüllt. assignee_user_id '
  'referenziert user_profiles (nicht auth.users) — konsistent mit dem '
  'Muster in user_work_schedules.';

-- 3. time_entries Erweiterung -------------------------------------------------
-- Nullable FKs — Altdaten bleiben unverändert, project_label lebt weiter.
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS project_id uuid
    REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS task_id uuid
    REFERENCES public.tasks(id) ON DELETE SET NULL;

-- 4. Reporting-Indexes (Modul 2 Vorarbeit; 10k-Einträge-tauglich) ------------
CREATE INDEX IF NOT EXISTS idx_time_entries_company_start
  ON public.time_entries (company_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_company_user_start
  ON public.time_entries (company_id, user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_company_project
  ON public.time_entries (company_id, project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_company_task
  ON public.time_entries (company_id, task_id)
  WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_billable
  ON public.time_entries (company_id, billable, start_time DESC);
