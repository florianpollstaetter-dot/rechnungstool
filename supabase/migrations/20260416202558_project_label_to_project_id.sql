-- Data-Migration: project_label → project_id / task_id (SCH-366 — Modul 4)
--
-- Voraussetzung: supabase_migration_projects_and_tasks.sql ist eingespielt.
--
-- Mappt existierende time_entries.project_label auf strukturierte
-- Project/Task-FKs:
--   1. Pro distinct (company_id, project_label) wird ein Projekt sichergestellt.
--      Bestehende Projekte (z.B. aus dem Auto-Quote-Flow) mit gleichem Namen
--      werden wiederverwendet, nichts wird dupliziert.
--   2. Pro betroffenem Projekt wird ein Default-Task "Allgemein" angelegt,
--      falls noch nicht vorhanden.
--   3. time_entries mit project_label und project_id IS NULL werden auf die
--      ermittelte (project_id, task_id) gesetzt.
--
-- Idempotent: wiederholtes Ausführen erzeugt keine Duplikate und überschreibt
-- keine bereits zugewiesenen project_id-Werte. project_label bleibt unberührt —
-- die bestehende Listen/Analytics-UI funktioniert weiter, bis alle UI-Slices
-- auf Projekt/Task umgezogen sind.

BEGIN;

-- 1. Projekte sicherstellen.
INSERT INTO public.projects (company_id, name, status)
SELECT dl.company_id, dl.label, 'active'
FROM (
  SELECT DISTINCT company_id, trim(project_label) AS label
  FROM public.time_entries
  WHERE project_label IS NOT NULL
    AND trim(project_label) <> ''
    AND project_id IS NULL
) dl
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.company_id = dl.company_id
    AND p.name = dl.label
);

-- 2. Default-Task "Allgemein" pro betroffenem Projekt sicherstellen.
INSERT INTO public.tasks (company_id, project_id, title, status, position)
SELECT p.company_id, p.id, 'Allgemein', 'open', 0
FROM public.projects p
WHERE EXISTS (
  SELECT 1 FROM public.time_entries te
  WHERE te.company_id = p.company_id
    AND te.project_id IS NULL
    AND te.project_label IS NOT NULL
    AND trim(te.project_label) = p.name
)
AND NOT EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.project_id = p.id
    AND t.title = 'Allgemein'
);

-- 3. time_entries auf (project_id, task_id) mappen.
-- DISTINCT ON (p.id) garantiert genau einen Task pro Projekt, falls durch
-- manuelle Eingriffe doch mehrere "Allgemein"-Tasks existieren sollten
-- (ältester gewinnt).
UPDATE public.time_entries te
SET
  project_id = proj.id,
  task_id    = proj.task_id
FROM (
  SELECT DISTINCT ON (p.id)
    p.id,
    p.company_id,
    p.name,
    t.id AS task_id
  FROM public.projects p
  JOIN public.tasks t
    ON t.project_id = p.id
   AND t.title = 'Allgemein'
  ORDER BY p.id, t.created_at ASC
) proj
WHERE te.company_id = proj.company_id
  AND te.project_label IS NOT NULL
  AND trim(te.project_label) = proj.name
  AND te.project_id IS NULL;

COMMIT;

-- Verifikation (optional, im Supabase SQL-Editor einzeln ausführen):
--
-- SELECT count(*) AS unmapped_entries
-- FROM public.time_entries
-- WHERE project_label IS NOT NULL
--   AND trim(project_label) <> ''
--   AND project_id IS NULL;
--
-- -> sollte 0 zurückgeben, nachdem das Skript gelaufen ist.
