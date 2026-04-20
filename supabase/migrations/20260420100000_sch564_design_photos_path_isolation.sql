-- SCH-564 F3: design-photos storage bucket path-prefix tenant isolation.
--
-- Before: any authenticated user could INSERT/SELECT/UPDATE/DELETE any object
-- in the design-photos bucket (policies checked only bucket_id). That allowed
-- cross-tenant overwrite/read/delete of photos using the authenticated Storage
-- API.
--
-- After: each policy additionally requires the first path segment
-- (storage.foldername(name))[1] to equal the caller's active company_id. All
-- existing upload call sites already use the `{company_id}/<file>` path layout
-- (`generate-design-image/route.ts`, `uploadDesignPhoto`, `saveAiGeneratedPhoto`),
-- so no object migration is needed.
--
-- Note: the bucket is public, so unauthenticated reads via the public URL
-- continue to work (public-bucket reads bypass storage RLS). Authenticated
-- listing / mutation through the Storage API is now tenant-scoped.

-- INSERT: upload only into your own company's path prefix
DROP POLICY IF EXISTS "Auth users can upload design-photos" ON storage.objects;
DROP POLICY IF EXISTS "company_upload_design_photos" ON storage.objects;
CREATE POLICY "company_upload_design_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'design-photos'
    AND (storage.foldername(name))[1] = (SELECT public.active_company_id())
  );

-- SELECT: list/read only your own company's objects
DROP POLICY IF EXISTS "Auth users can view design-photos" ON storage.objects;
DROP POLICY IF EXISTS "company_view_design_photos" ON storage.objects;
CREATE POLICY "company_view_design_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'design-photos'
    AND (storage.foldername(name))[1] = (SELECT public.active_company_id())
  );

-- UPDATE: overwrite only your own company's objects
DROP POLICY IF EXISTS "Auth users can update design-photos" ON storage.objects;
DROP POLICY IF EXISTS "company_update_design_photos" ON storage.objects;
CREATE POLICY "company_update_design_photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'design-photos'
    AND (storage.foldername(name))[1] = (SELECT public.active_company_id())
  )
  WITH CHECK (
    bucket_id = 'design-photos'
    AND (storage.foldername(name))[1] = (SELECT public.active_company_id())
  );

-- DELETE: delete only your own company's objects
DROP POLICY IF EXISTS "Auth users can delete design-photos" ON storage.objects;
DROP POLICY IF EXISTS "company_delete_design_photos" ON storage.objects;
CREATE POLICY "company_delete_design_photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'design-photos'
    AND (storage.foldername(name))[1] = (SELECT public.active_company_id())
  );
