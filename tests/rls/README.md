# RLS Tenant Isolation Tests — SCH-833

Verifies that every tenant-isolated table enforces row-level security: a
user authenticated to Company A must never be able to read Company B's rows.

## How it works

`check_tenant_isolation.mjs` runs against the live Supabase instance (preview
branch or production) using real JWT tokens and real RLS evaluation:

1. Creates two temporary companies and two auth users via the Admin API.
2. Seeds one row per guarded table for each company.
3. Signs in as each user with the Supabase JS client and reads every table.
4. Asserts that no row belonging to the other tenant is visible.
5. Deletes all test data.

## Running locally

```bash
export NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
export SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

node tests/rls/check_tenant_isolation.mjs
```

## Adding a new tenant-isolated table

When you add a new table protected by a `tenant_isolation` RLS policy:

1. Add an entry to the `TABLES` array in `check_tenant_isolation.mjs`:
   ```js
   { table: "my_new_table", companyCol: "company_id" },
   ```
2. Add a case in `buildExtraFields()` that provides the minimal NOT NULL
   fields required for an insert to succeed:
   ```js
   case "my_new_table":
     return { user_id: userId, name: "Test" };
   ```
3. Run the test locally to confirm both the seed and the isolation check pass.

## CI

The test runs automatically via `.github/workflows/rls-tests.yml` on any push
or PR that touches `supabase/migrations/**`.  It reuses the same Supabase
secrets already configured for the Playwright suite.
