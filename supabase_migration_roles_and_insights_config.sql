-- Migration: Company Roles + Smart-Insights-Config (SCH-366 — Rollen-System + Dashboard-Config)
-- Self-contained — Reihenfolge gegenüber anderen Migrationen egal.
--
-- Scope:
--   1. company_roles          — Admin-verwaltete Custom-Rollen pro Firma
--   2. user_role_assignments  — M:N Zuordnung User ↔ Rolle
--   3. products.role_id       — Welche Rolle braucht dieses Produkt?
--   4. quote_items.role_id    — Manuelle Rollenzuordnung pro Angebotsposition
--   5. tasks.role_id          — Rolle der Aufgabe → Auto-Suggestion für MA
--   6. projects.budget_hours  — Stundenbudget für Budget-Überschreitungs-Insight
--   7. smart_insights_config  — Konfigurierbare Schwellwerte pro Firma

-- 0. updated_at trigger helper (idempotent) -----------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. company_roles ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  text NOT NULL,
  name        text NOT NULL,
  description text,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_company_roles_company
  ON public.company_roles (company_id);

DROP TRIGGER IF EXISTS company_roles_set_updated_at ON public.company_roles;
CREATE TRIGGER company_roles_set_updated_at
  BEFORE UPDATE ON public.company_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.company_roles IS
  'Admin-verwaltete Custom-Rollen pro Firma (SCH-366). Beispiele: Kameramann, '
  'Postproduction, Projektleitung. Werden Usern, Produkten und Aufgaben '
  'zugeordnet für Auto-Suggestion bei Projektanlage aus Angeboten.';

-- 2. user_role_assignments ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  text NOT NULL,
  user_id     uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES public.company_roles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user
  ON public.user_role_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_role
  ON public.user_role_assignments (role_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_company
  ON public.user_role_assignments (company_id);

COMMENT ON TABLE public.user_role_assignments IS
  'M:N Zuordnung User ↔ Custom-Rolle (SCH-366). Ein User kann mehrere '
  'Rollen haben (z.B. Kameramann + Postproduction). Wird für Auto-Suggestion '
  'bei Projektanlage genutzt: Aufgabe mit Rolle X → schlage User mit Rolle X vor.';

-- 3. products.role_id ---------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS role_id uuid
    REFERENCES public.company_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_role
  ON public.products (role_id)
  WHERE role_id IS NOT NULL;

COMMENT ON COLUMN public.products.role_id IS
  'Welche Custom-Rolle braucht dieses Produkt? Wird beim Angebotsposition-'
  'Auswählen auf die quote_items.role_id und bei Projektanlage auf tasks.role_id '
  'übertragen. NULL = keine Rolle (z.B. Material-Produkte).';

-- 4. quote_items.role_id ------------------------------------------------------
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS role_id uuid
    REFERENCES public.company_roles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.quote_items.role_id IS
  'Rolle für diese Angebotsposition. Auto-filled aus products.role_id wenn '
  'ein Produkt ausgewählt wird; manuell setzbar wenn kein Produkt zugeordnet.';

-- 5. tasks.role_id ------------------------------------------------------------
-- (task-Tabelle wurde in supabase_migration_projects_and_tasks.sql angelegt)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS role_id uuid
    REFERENCES public.company_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_role
  ON public.tasks (role_id)
  WHERE role_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.role_id IS
  'Welche Rolle wird für diese Aufgabe gebraucht? Übernommen aus '
  'quote_items.role_id bei Auto-Anlage aus Angebot. Basis für '
  'Auto-Suggestion von Mitarbeitern.';

-- 6. projects.budget_hours ----------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS budget_hours numeric(10, 2)
    CHECK (budget_hours IS NULL OR budget_hours >= 0);

COMMENT ON COLUMN public.projects.budget_hours IS
  'Stundenbudget für das Projekt. Wird bei Auto-Anlage aus dem Angebot '
  'berechnet (Summe der Stunden-Positionen). Basis für den Smart-Insight '
  '"Budget-Überschreitung". NULL = kein Budget gesetzt.';

-- 7. smart_insights_config ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.smart_insights_config (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  text NOT NULL UNIQUE,
  billable_rate_min           numeric(5, 4) NOT NULL DEFAULT 0.6000,
  period_growth_threshold     numeric(5, 4) NOT NULL DEFAULT 0.3000,
  top_project_share_max       numeric(5, 4) NOT NULL DEFAULT 0.4000,
  budget_overshoot_warn_pct   numeric(5, 4) NOT NULL DEFAULT 0.8000,
  budget_overshoot_critical_pct numeric(5, 4) NOT NULL DEFAULT 0.9500,
  overtime_threshold_pct      numeric(5, 4) NOT NULL DEFAULT 0.1000,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS smart_insights_config_set_updated_at
  ON public.smart_insights_config;
CREATE TRIGGER smart_insights_config_set_updated_at
  BEFORE UPDATE ON public.smart_insights_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.smart_insights_config IS
  'Konfigurierbare Schwellwerte für Smart-Insight-Regeln (SCH-366 Modul 1). '
  'Admin setzt Werte in den Einstellungen; Defaults sind die empfohlenen '
  'Startwerte. Eine Zeile pro Firma.';
