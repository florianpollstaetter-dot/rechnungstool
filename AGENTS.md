<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database migrations — never manual, always automated

**Rule:** Never ask the user to paste SQL into the Supabase dashboard. Migrations deploy automatically via GitHub Actions on push to master.

**Where migrations live:**
- All migrations go under `supabase/migrations/<timestamp>_<name>.sql` (Supabase CLI convention; `<timestamp>` is `YYYYMMDDHHMMSS`).
- Config lives at `supabase/config.toml`. Don't commit anything under `supabase/.temp/` or `supabase/.branches/`.

**How the pipeline works:**
1. Engineer creates a new migration file under `supabase/migrations/` and pushes to master
2. `.github/workflows/supabase-migrations.yml` runs `supabase db push` against the linked project
3. Vercel auto-deploys in parallel — code and schema ship together
4. First-run seeding of `supabase_migrations.schema_migrations` is already done for Orange Octo — the CLI will only pick up net-new versions on each push

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
