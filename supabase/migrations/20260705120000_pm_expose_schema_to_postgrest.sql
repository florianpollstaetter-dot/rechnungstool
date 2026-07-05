-- =============================================================================
-- SCH-825 / ORA-2702 seam fix: expose the `pm` schema to PostgREST
-- =============================================================================
-- The PM app queries its tables via the Supabase JS client using
-- `.schema("pm").from(...)` (see src/lib/pm/*, src/app/api/pm/**). Those calls
-- go through PostgREST, which by default only exposes `public, graphql_public`.
-- Without exposing `pm`, every authenticated PM data request fails with
-- PGRST106 ("schema not exposed") -> the whole feature is non-functional in
-- prod even though routes deploy and auth-gate correctly.
--
-- Supabase stores the API "Exposed schemas" setting as a role-level GUC on the
-- `authenticator` role. Setting it here (preserving the existing public +
-- graphql_public) additively adds `pm`, then reloads PostgREST config.
--
-- Blast radius: none on Orange-Octo core. Existing exposed schemas are kept;
-- we only append `pm`. Idempotent — ALTER ROLE ... SET writes an absolute
-- value, safe to re-run.
-- =============================================================================

ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, pm';

NOTIFY pgrst, 'reload config';
