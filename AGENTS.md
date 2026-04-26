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
2. `.github/workflows/supabase-migrations.yml` runs `.github/scripts/apply_migrations.py`, which applies pending migrations via the Supabase Management API (no DB password, no Supabase CLI). The script reads `supabase_migrations.schema_migrations`, applies each missing file in order, and records the version.
3. `.github/workflows/supabase-migrations-drift.yml` runs `apply_migrations.py --dry-run` on every PR that touches migrations and on a daily cron (06:00 UTC). Hard-fails (exit 2) if the repo is ahead of `schema_migrations` — guards against silent apply-pipeline failures (see SCH-834).
4. Vercel auto-deploys in parallel — code and schema ship together
5. Required GitHub secrets: `SUPABASE_ACCESS_TOKEN` (personal access token) and `SUPABASE_PROJECT_REF` (`kjxmanenruaqzrzjueny` for Orange Octo). Nothing else — no DB password, no pooler URL.

**GitHub-Secret onboarding checklist (do this on first repo setup AND when rotating tokens):**
1. Generate a Supabase personal access token: https://supabase.com/dashboard/account/tokens
2. Store it locally in `.env.local` as `SUPABASE_ACCESS_TOKEN=sbp_…` (gitignored)
3. Add it to GitHub: Repo > Settings > Secrets and variables > Actions > New repository secret, name `SUPABASE_ACCESS_TOKEN`
4. Add `SUPABASE_PROJECT_REF=kjxmanenruaqzrzjueny` the same way
5. Verify by running `python3 .github/scripts/apply_migrations.py --dry-run` locally and triggering the `Supabase migrations` workflow in Actions tab → expect green run with "No pending migrations." in logs

**Local verification before pushing migrations:**
```
python3 .github/scripts/apply_migrations.py --dry-run
```
Exits 0 if clean, 2 if there is drift, 1 on infra errors. Use this to confirm prod state before opening a PR.

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
