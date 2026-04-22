-- SCH-633: company_documents — per-tenant Lastenheft / plan / competitor-analysis
-- storage for the multi-vertical platform rollout (piercing / tattoo / pet-groomer).
-- Designer (SCH-631) shipped the viewer UI + DOCX-export button; this migration
-- backs those endpoints.

CREATE TABLE IF NOT EXISTS public.company_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, key)
);

CREATE INDEX IF NOT EXISTS company_documents_company_key_idx
  ON public.company_documents (company_id, key);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

-- Members of a company can read its documents. Writes happen via the service
-- role (server-side seed / admin tooling); no user-facing mutation path yet.
DROP POLICY IF EXISTS company_documents_select_member ON public.company_documents;
CREATE POLICY company_documents_select_member ON public.company_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_documents.company_id
        AND cm.user_id = (SELECT auth.uid())
    )
  );

-- updated_at auto-maintenance.
CREATE OR REPLACE FUNCTION public.company_documents_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS company_documents_touch_updated_at ON public.company_documents;
CREATE TRIGGER company_documents_touch_updated_at
  BEFORE UPDATE ON public.company_documents
  FOR EACH ROW EXECUTE FUNCTION public.company_documents_touch_updated_at();
