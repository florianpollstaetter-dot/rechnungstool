-- =============================================================================
-- SCH-958 K3-AA1: Company logo upload — storage bucket
-- =============================================================================
-- Adds a public `company-logos` bucket. Path layout `{company_id}/<filename>`
-- is enforced by storage RLS so a tenant can only read/write objects under its
-- own prefix. The `company_settings.logo_url` column already exists; this
-- migration only provisions storage. The settings page renders an admin-only
-- upload UI that writes there and updates `logo_url`.
--
-- Public reads are intentional: PDF rendering and the company switcher fetch
-- the logo URL directly from the bucket's public CDN endpoint.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- INSERT: upload only into your own company's path prefix
DROP POLICY IF EXISTS "company_upload_company_logos" ON storage.objects;
CREATE POLICY "company_upload_company_logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = (SELECT public.active_company_id())
  );

-- SELECT: list/read only your own company's objects (public reads bypass RLS)
DROP POLICY IF EXISTS "company_view_company_logos" ON storage.objects;
CREATE POLICY "company_view_company_logos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = (SELECT public.active_company_id())
  );

-- UPDATE: overwrite only your own company's objects
DROP POLICY IF EXISTS "company_update_company_logos" ON storage.objects;
CREATE POLICY "company_update_company_logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = (SELECT public.active_company_id())
  )
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = (SELECT public.active_company_id())
  );

-- DELETE: delete only your own company's objects
DROP POLICY IF EXISTS "company_delete_company_logos" ON storage.objects;
CREATE POLICY "company_delete_company_logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = (SELECT public.active_company_id())
  );
