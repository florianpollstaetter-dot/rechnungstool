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
3. Vercel auto-deploys in parallel — code and schema ship together
4. Required GitHub secrets: `SUPABASE_ACCESS_TOKEN` (personal access token) and `SUPABASE_PROJECT_REF` (`kjxmanenruaqzrzjueny` for Orange Octo). Nothing else — no DB password, no pooler URL.

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

# Pre-push gate — `npm run build`, not just `tsc --noEmit`

**Rule:** any change touching a `src/app/*.tsx` server component, a `"use client"` module imported from one, or any other client/server boundary crossing MUST be verified with `npm run build` before push — not just `tsc --noEmit`.

**Why:** `tsc --noEmit` checks types but not the Next.js client/server boundary. A `"use client"` module's named exports are wrapped as reference proxies when imported from a server component; the types remain nominally correct (`FAQ_ITEMS: FaqItem[]`) but the runtime value is a proxy, so `.map(...)` throws `is not a function` only at `next build`'s "Collecting page data" phase.

**Real incident (SCH-600 Phase 4 v2, 2026-05-24):** `0915a57` exported `FAQ_ITEMS` from `LandingFaqSection.tsx` (`"use client"`) and imported it from `page.tsx` (server). `tsc --noEmit` passed. Vercel silently rolled back to the previous green build for ~45 min, serving stale copy to production while master appeared green. Fix in `7d7c059` extracted data to a plain `LandingFaqData.ts`.

**Practical pattern:** put any data that both server and client components need into a plain TS module (no `"use client"`), then import it from both sides. Client-component named exports of data are a footgun.

**Post-push smoke for landing changes:** after Vercel finishes building (~2–5 min), curl prod and grep for a unique marker from the new commit. Five seconds; catches deploy-failed-silently in seconds instead of hours.
