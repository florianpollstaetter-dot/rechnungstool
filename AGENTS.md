<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database migrations — never manual, always automated

**Rule:** Never ask the user to paste SQL into the Supabase dashboard. Migrations deploy automatically via GitHub Actions on push to master.

**Where migrations live:**
- New migrations: `supabase/migrations/<timestamp>_<name>.sql` (Supabase CLI convention)
- Legacy files at repo root (`supabase_migration_*.sql`) are historical — they have all been applied to production. Do not re-run them.

**How the pipeline works:**
1. Engineer creates a new migration file under `supabase/migrations/`
2. Commits and pushes to master
3. GitHub Action runs `supabase db push --linked` against the linked project
4. Vercel auto-deploys in parallel — code and schema ship together

**If you need to apply an ad-hoc SQL change without a full deploy:**
- Use the Supabase Management API: `POST https://api.supabase.com/v1/projects/{ref}/database/query`
- Requires `Authorization: Bearer $SUPABASE_ACCESS_TOKEN` **and** a browser-like `User-Agent` header (Cloudflare blocks naked `python-urllib` / similar with 403 error 1010)
- Project ref for Orange Octo: `kjxmanenruaqzrzjueny`
- Token lives in `.env.local` as `SUPABASE_ACCESS_TOKEN` (gitignored — never commit)

**Writing migrations defensively:**
- Always `IF NOT EXISTS` on CREATE TABLE / CREATE INDEX
- For ALTER TABLE against tables that may not exist in every environment, wrap in `DO $$ IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'foo') THEN ... END $$;`
- For CREATE POLICY, always `DROP POLICY IF EXISTS` first so re-runs are idempotent
- Match column types exactly — `user_profiles.auth_user_id` is `uuid`, not `text`. Do NOT cast `auth.uid()::text` when comparing to UUID columns.
