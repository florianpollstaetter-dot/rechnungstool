-- Migration: User Dashboard Layouts (SCH-366 — Modul 1 Backend)
-- Self-contained — Reihenfolge gegenüber anderen Migrationen egal.
--
-- Eine Zeile pro (company_id, user_id, dashboard_key). dashboard_key
-- erlaubt mehrere Dashboards pro User in der Zukunft (Default: 'main').
-- layout_json speichert das react-grid-layout-Objekt opak — die UI
-- schreibt es als Ganzes, kein Server-seitiger Schema-Lookup nötig
-- (vgl. Feasibility-Report SCH-375, Abschnitt 3 Modul 1).

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

CREATE TABLE IF NOT EXISTS public.user_dashboard_layouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    text NOT NULL,
  user_id       uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  dashboard_key text NOT NULL DEFAULT 'main',
  layout_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, dashboard_key)
);

CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_user
  ON public.user_dashboard_layouts (user_id);

DROP TRIGGER IF EXISTS user_dashboard_layouts_set_updated_at
  ON public.user_dashboard_layouts;

CREATE TRIGGER user_dashboard_layouts_set_updated_at
  BEFORE UPDATE ON public.user_dashboard_layouts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.user_dashboard_layouts IS
  'Pro-User-Layout der Dashboard-Widgets (SCH-366, Modul 1). layout_json '
  'enthält das react-grid-layout-Objekt opak — die UI ist die einzige '
  'Schreib- und Lese-Schnittstelle, kein Server-Schema-Validation. '
  'dashboard_key erlaubt mehrere benannte Dashboards pro User; Default '
  '"main" für das Standard-Dashboard.';
