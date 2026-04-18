-- =============================================================================
-- SCH-440: Quote Design System — Photo Pool & Design Selection
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. quote_design_photos — persistent photo pool per company
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quote_design_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_type   TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size   INTEGER NOT NULL DEFAULT 0,
  alt_text    TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_prompt   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_design_photos_company
  ON quote_design_photos(company_id);

ALTER TABLE quote_design_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_design_photos_company_isolation" ON quote_design_photos
  FOR ALL USING (company_id = current_setting('app.active_company_id', true));

-- ---------------------------------------------------------------------------
-- 2. quote_design_selections — which design + photos a quote uses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quote_design_selections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id      UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  design_key    TEXT NOT NULL DEFAULT 'classic',
  photo_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quote_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_design_selections_company
  ON quote_design_selections(company_id);
CREATE INDEX IF NOT EXISTS idx_quote_design_selections_quote
  ON quote_design_selections(quote_id);

ALTER TABLE quote_design_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_design_selections_company_isolation" ON quote_design_selections
  FOR ALL USING (company_id = current_setting('app.active_company_id', true));

-- ---------------------------------------------------------------------------
-- 3. Storage bucket for design photos
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('design-photos', 'design-photos', true)
ON CONFLICT (id) DO NOTHING;
