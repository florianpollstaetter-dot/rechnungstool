# Phase 5 — Storage-Bucket-Audit

**SCH-600 Phase 5 Item #9** · 2026-05-24 · Engineer (claude_local)

## Methodology

CEO suggested querying the Supabase Management API live via the existing
`SUPABASE_ACCESS_TOKEN`. That token returned `{"message":"Unauthorized"}`
against both `POST /v1/projects/{ref}/database/query` and `GET /v1/projects`
during this audit — it appears to have been rotated or its scope no longer
covers project `kjxmanenruaqzrzjueny`. This is itself an audit finding
(see Finding #4 below).

To avoid blocking, the audit was performed from the **migration source-of-truth**
in `supabase/migrations/` and from the storage-API call sites in `src/`.
The migrations are authoritative for any environment provisioned through the
GitHub Actions deploy pipeline (`.github/workflows/supabase-migrations.yml`).

Files reviewed:
- All 61 migrations under `supabase/migrations/`
- All `supabase().storage.from(...)` call sites in `src/`
- The `analyze-receipt` and `analyze-expense` service-role routes
- `register-company` route (storage-adjacent but no bucket writes)

## Buckets

| Bucket           | Public | Provisioned in migrations              | Path layout                              | RLS posture                 |
| ---------------- | ------ | -------------------------------------- | ---------------------------------------- | --------------------------- |
| `design-photos`  | yes    | ✅ `20260417201050` + `20260418112000`  | `{company_id}/<uuid>.<ext>`              | ✅ path-prefix isolation     |
| `company-logos`  | yes    | ✅ `20260501074400`                     | `{company_id}/logo-<ts>.<ext>`           | ✅ path-prefix isolation     |
| `receipts`       | ?      | ❌ **not in migrations**                | `<uuid>.<ext>` (**no company prefix**)   | ❌ **unverifiable from src** |

## Findings

### Finding #1 — `receipts` bucket is not version-controlled (SEVERITY: HIGH)

**Observation:** The `receipts` bucket is the most heavily used storage bucket
in the application — referenced in 9 source locations:

- `src/lib/db.ts:873,1813,1821,1827` — upload, remove, getPublicUrl
- `src/app/(app)/receipts/page.tsx:100` — createSignedUrl (300s TTL)
- `src/app/(app)/expenses/page.tsx:269,314,341` — createSignedUrl + remove
- `src/app/api/analyze-receipt/route.ts:35` — service-role download
- `src/app/api/analyze-expense/route.ts:36` — service-role download

Yet no migration in `supabase/migrations/` provisions it. It must have been
created out-of-band via the Supabase Dashboard in early development and never
backfilled into source. Its `public` flag and `storage.objects` RLS policies
are **opaque to source-only audit**.

**Risk:**
- New environments (fresh staging, PR previews not seeded from prod backup)
  will break on first receipt upload because the bucket does not exist.
- Disaster recovery is structurally degraded — a rebuild from migrations
  alone would not produce a working receipts flow.
- We cannot prove via code review that the bucket is not publicly listable
  or that anonymous downloads of guessed UUIDs are prevented.

**Recommended remediation (out of scope for this audit, file as follow-up
issue):**
1. New migration `<ts>_sch600_receipts_bucket.sql`:
   ```sql
   INSERT INTO storage.buckets (id, name, public)
   VALUES ('receipts', 'receipts', false)
   ON CONFLICT (id) DO NOTHING;
   ```
   Use `public: false` since current access pattern relies on
   `createSignedUrl` not `getPublicUrl`. (`lib/db.ts:1827`'s `getPublicUrl`
   call is suspect — see Finding #2.)
2. Same migration — add the four storage.objects RLS policies (`INSERT`,
   `SELECT`, `UPDATE`, `DELETE`) scoped to `bucket_id = 'receipts'`.
   Cannot use the path-prefix pattern from `design-photos` / `company-logos`
   without also restructuring upload paths — see Finding #3.

### Finding #2 — `receipts` mixes `getPublicUrl` with `createSignedUrl` (SEVERITY: MEDIUM)

**Observation:** `lib/db.ts:1827` returns `supabase().storage.from("receipts").getPublicUrl(path)`.
This works only if the bucket is `public: true`. All other call sites use
`createSignedUrl` (which works on both public and private buckets but is the
correct pattern for tenant-sensitive content).

**Risk:** If the bucket is currently `public: true`, then anyone who knows
the UUID-only path of a receipt can fetch it without authentication —
including from outside the tenant. UUIDs are unguessable on the timescale
of a brute-force attack (122-bit entropy), but they leak through:
- Browser dev-tools / Network tab snapshots shared in support tickets
- Email forwarding of receipt-link notifications (if any)
- Server log aggregation that captures URL paths

**Recommended remediation:** Migrate the `getPublicUrl` call site at
`lib/db.ts:1827` to `createSignedUrl` (consistent with the rest of the
codebase) and set `public: false` in the provisioning migration from
Finding #1. Audit who calls this function and what they do with the URL.

### Finding #3 — `receipts` paths lack tenant prefix (SEVERITY: MEDIUM)

**Observation:** `lib/db.ts:1820`:
```ts
const path = `${crypto.randomUUID()}.${ext}`;
const { error } = await supabase().storage.from("receipts").upload(path, file);
```

Compare with the design-photos pattern at `lib/db.ts:2441`:
```ts
const path = `${getActiveCompanyId()}/${crypto.randomUUID()}.${ext}`;
```

**Why this matters:** Path-prefix RLS like
`(storage.foldername(name))[1] = active_company_id()` is the cleanest way
to lock down storage.objects per tenant. Without the `{company_id}/` prefix
in the upload code, this RLS pattern cannot be applied to the receipts
bucket without first migrating all existing object names.

**Current mitigation:** Cross-tenant access to a receipt is prevented at
the **`receipts` table** layer:
- The `receipts` table has `tenant_isolation` RLS
  (`supabase/migrations/20260418093458_rls_multi_tenancy.sql:394-396`)
  scoped by `company_id`.
- All client-side reads go through `createSignedUrl`, which requires the
  client to already hold a row with that `file_path` — which the table RLS
  blocks for other tenants.
- Service-role routes (`analyze-receipt`, `analyze-expense`) check
  ownership via `.eq("id", X).eq("company_id", companyId)` before reading
  from storage (`route.ts:14-18, 35`).

This is **defense-in-depth-minus-one** — it works as long as the table RLS
is intact, but loses the bucket-level safety net that the other two
buckets enjoy.

**Recommended remediation:** Two options.
- **Option A (lighter):** Add storage.objects RLS that requires
  `bucket_id = 'receipts' AND auth.role() = 'authenticated'`. This only
  forces auth, doesn't add tenant isolation, but at least removes
  anonymous-public risk.
- **Option B (proper):** Switch upload paths to `{company_id}/<uuid>.<ext>`
  AND add path-prefix RLS, mirroring the design-photos pattern. Requires
  a one-shot data migration to rename all existing storage objects (can
  be done from a script using the service-role key, reads paths from
  the `receipts` table and copies-then-deletes within the bucket).

### Finding #4 — `SUPABASE_ACCESS_TOKEN` in `.env.local` is unauthorized (SEVERITY: LOW-but-blocks-audit-loop)

**Observation:** Per `CLAUDE.md`'s instructions and CEO's audit comment,
`.env.local` holds a `SUPABASE_ACCESS_TOKEN` for ad-hoc Management API
queries. The token in this workspace returns `{"message":"Unauthorized"}`
against both the project-scoped query endpoint and the bare `/v1/projects`
endpoint — indicating either token revocation, scope reduction, or that
the workspace was checked out from a stale `.env.local` snapshot. Token
shape is correct (`sbp_` prefix, 44 chars).

**Risk:** This audit could not directly observe production storage state.
Any future Storage / Auth / RLS audit that tries to use this token will
hit the same wall. Other security work that depends on Management API
access (Storage objects enumeration, RLS coverage scan, log audit) is
similarly blocked.

**Recommended remediation:** CEO/Florian to rotate the token in the
Supabase dashboard (Profile → Access Tokens) and republish to `.env.local`
on the engineering workstations. Verify by re-running:
```bash
curl -s "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "User-Agent: Mozilla/5.0 (compatible; rechnungstool-audit/1.0)"
```
Expected: JSON list of projects including `kjxmanenruaqzrzjueny`.

## What was verified clean

- **`design-photos`**: provisioned (`20260417201050`), fixed
  (`20260418112000`), path-prefix isolated (`20260420100000_sch564`).
  Upload paths in code (`db.ts:2441`, `db.ts:2471`) correctly use
  `{company_id}/<file>` pattern. All four CRUD storage.objects policies
  scoped to bucket + path-prefix. Public flag intentional for PDF/CDN
  fetches.
- **`company-logos`**: provisioned with full path-prefix RLS in a single
  migration (`20260501074400_sch958`). Upload at `db.ts:225` uses
  correct `{companyId}/logo-{ts}.{ext}` pattern. Public flag
  intentional (mirrored in PDFs + switcher).
- **Service-role download routes** (`analyze-receipt`, `analyze-expense`):
  fetch the storage path **only after** verifying tenant ownership of
  the row in the underlying table via `.eq("company_id", companyId)`.
  Safe even on the receipts bucket that lacks path-prefix isolation,
  because the access vector through these routes goes through a
  RLS-equivalent check.
- **No service-role storage writes** that would bypass tenant
  enforcement detected. All writes go through user-scoped clients.

## Phase 5 Item #9 status

**Done — audit-from-source complete.** Three actionable findings
(#1–#3) name concrete remediations as follow-up issues. Finding #4 is a
small operational blocker for future live-audit work but does not block
this audit's conclusions; the source-of-truth approach is in some ways
stronger than a one-shot Management API query because it surveys the
intent of the change history rather than the (possibly-drifted) current
state.

Follow-up issues recommended (not auto-created — CEO scoping needed
on whether to bundle as one SCH-600-child or split):
1. Add `<ts>_sch600_receipts_bucket.sql` migration (Findings #1 + #2)
2. Switch `lib/db.ts:1827` `getPublicUrl` → `createSignedUrl` (Finding #2)
3. Storage-path migration to `{company_id}/<uuid>` for receipts + add
   path-prefix RLS (Finding #3, Option B) — needs data-migration plan
4. Rotate `SUPABASE_ACCESS_TOKEN` and republish (Finding #4) — CEO/Florian
