-- SCH-425 follow-up + SCH-558 root-cause closure:
-- Drop ALL remaining permissive USING(true) policies that mask the per-table
-- `tenant_isolation` policy. Postgres RLS OR's policies for the same role, so
-- one USING(true) policy nullifies tenant filtering completely.
--
-- Florian (board) on 2026-04-25 18:31Z: switching the active company still
-- showed the same data — confirmed by querying pg_policy: 18+ legacy permissive
-- policies live alongside the correct tenant_isolation policy on quotes,
-- invoices, customers, products, etc. This is an online-shipping blocker.
--
-- Each table below already has a `tenant_isolation` policy with the correct
-- `(company_id = active_company_id())` filter. After dropping the permissive
-- ones, only tenant_isolation remains — and that's what we want.
--
-- All DROPs use IF EXISTS so the migration is idempotent across environments
-- where some legacy policies may already be gone.

-- bank_statements
DROP POLICY IF EXISTS "Auth users can manage bank_statements" ON public.bank_statements;

-- bank_transactions
DROP POLICY IF EXISTS "Auth users can manage bank_transactions" ON public.bank_transactions;

-- company_settings
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.company_settings;

-- customers
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.customers;

-- expense_items
DROP POLICY IF EXISTS "Auth users can manage expense_items" ON public.expense_items;

-- expense_reports
DROP POLICY IF EXISTS "Auth users can manage expense_reports" ON public.expense_reports;

-- fixed_costs
DROP POLICY IF EXISTS "Auth users can manage fixed_costs" ON public.fixed_costs;

-- invoice_items
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.invoice_items;

-- invoices
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.invoices;

-- products
DROP POLICY IF EXISTS products_all ON public.products;
DROP POLICY IF EXISTS products_anon ON public.products;

-- quote_items
DROP POLICY IF EXISTS quote_items_all ON public.quote_items;
DROP POLICY IF EXISTS quote_items_anon ON public.quote_items;

-- quotes
DROP POLICY IF EXISTS quotes_all ON public.quotes;
DROP POLICY IF EXISTS quotes_anon ON public.quotes;

-- receipts (had per-command permissive policies; tenant_isolation covers all)
DROP POLICY IF EXISTS "Authenticated users can delete receipts" ON public.receipts;
DROP POLICY IF EXISTS "Authenticated users can insert receipts" ON public.receipts;
DROP POLICY IF EXISTS "Authenticated users can read receipts" ON public.receipts;
DROP POLICY IF EXISTS "Authenticated users can update receipts" ON public.receipts;

-- templates
DROP POLICY IF EXISTS "Auth users can manage templates" ON public.templates;

-- time_entries
DROP POLICY IF EXISTS "Auth users can manage time_entries" ON public.time_entries;

-- Sanity check: emit a NOTICE listing tables that still have a USING(true)
-- policy after this migration runs. Surfaces any leak we missed.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT n.nspname || '.' || c.relname AS qualified, p.polname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND pg_get_expr(p.polqual, p.polrelid) = 'true'
      AND c.relname NOT IN ('public_videos', 'video_likes', 'video_saves')
  LOOP
    RAISE NOTICE 'WARN: residual permissive policy: % on %', rec.polname, rec.qualified;
  END LOOP;
END $$;
