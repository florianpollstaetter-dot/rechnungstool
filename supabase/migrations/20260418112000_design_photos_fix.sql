-- =============================================================================
-- SCH-471: Fix broken photo upload in Angebote design window
-- =============================================================================
-- The earlier 20260417201050_quote_designs.sql migration was marked applied
-- during the first-run CLI seed but the SQL never ran against prod (at that
-- point `companies` did not exist yet, so the FK would have failed, and on
-- subsequent runs `supabase db push` skipped it because the marker existed).
--
-- This migration re-creates the tables, bucket, and adds missing storage RLS
-- so upload works. All statements are idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. quote_design_photos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quote_design_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_path    TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_type    TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size    INTEGER NOT NULL DEFAULT 0,
  alt_text     TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_prompt    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_design_photos_company
  ON quote_design_photos(company_id);

ALTER TABLE quote_design_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_design_photos_company_isolation" ON quote_design_photos;
DROP POLICY IF EXISTS "tenant_isolation" ON quote_design_photos;
CREATE POLICY "tenant_isolation" ON quote_design_photos
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---------------------------------------------------------------------------
-- 2. quote_design_selections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quote_design_selections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id   UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  design_key TEXT NOT NULL DEFAULT 'classic',
  photo_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quote_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_design_selections_company
  ON quote_design_selections(company_id);
CREATE INDEX IF NOT EXISTS idx_quote_design_selections_quote
  ON quote_design_selections(quote_id);

ALTER TABLE quote_design_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_design_selections_company_isolation" ON quote_design_selections;
DROP POLICY IF EXISTS "tenant_isolation" ON quote_design_selections;
CREATE POLICY "tenant_isolation" ON quote_design_selections
  FOR ALL USING (
    company_id = (select public.active_company_id())
  )
  WITH CHECK (
    company_id = (select public.active_company_id())
  );

-- ---------------------------------------------------------------------------
-- 3. Storage bucket for design photos
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('design-photos', 'design-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. storage.objects RLS for design-photos (mirrors receipts pattern)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users can upload design-photos" ON storage.objects;
CREATE POLICY "Auth users can upload design-photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'design-photos');

DROP POLICY IF EXISTS "Auth users can view design-photos" ON storage.objects;
CREATE POLICY "Auth users can view design-photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'design-photos');

DROP POLICY IF EXISTS "Auth users can update design-photos" ON storage.objects;
CREATE POLICY "Auth users can update design-photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'design-photos');

DROP POLICY IF EXISTS "Auth users can delete design-photos" ON storage.objects;
CREATE POLICY "Auth users can delete design-photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'design-photos');
