-- SCH-962: Operator Console — Unternehmen archivieren / sperren / löschen
--
-- Adds:
--   1. companies.archived_at (TIMESTAMPTZ, nullable) — set by operator to hide
--      the company from the default list while keeping data + login intact.
--      Login lock is unrelated and lives on companies.status='suspended'.
--   2. purge_company(p_company_id) SECURITY DEFINER function — deletes all
--      tenant data for a company and the company row itself in one
--      transaction. Used by the operator DELETE endpoint. Disables triggers
--      via session_replication_role so it works even on read-only-locked
--      companies (SCH-481).

-- 1. archived_at column + index
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS companies_archived_at_idx
  ON public.companies(archived_at);

-- 2. purge_company() — hard delete a company and all its tenant data.
--    Iterates every public.* table that has a `company_id` column and deletes
--    the matching rows. FK cascades take care of dependents (invoice_items,
--    quote_items, chat_messages, …) once their parent rows are removed.
--
--    The SCH-481 read-only trigger blocks deletes on writable tenant tables
--    when a company is overdue >60 days. Operator-initiated purges must
--    succeed regardless, so we first flip the company's is_free flag to
--    `true` (which makes is_company_read_only() return false) before doing
--    the actual deletes. The flag never matters again because the company
--    row is removed at the end of the function.
CREATE OR REPLACE FUNCTION public.purge_company(p_company_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table   TEXT;
BEGIN
  IF p_company_id IS NULL OR length(p_company_id) = 0 THEN
    RAISE EXCEPTION 'purge_company: company id required';
  END IF;

  -- Defuse the SCH-481 read-only trigger for the rest of this transaction by
  -- pretending the company is on the free tier. Skip silently if the column
  -- doesn't exist yet (pre-SCH-480 environments).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'companies'
       AND column_name  = 'is_free'
  ) THEN
    UPDATE public.companies SET is_free = true WHERE id = p_company_id;
  END IF;

  -- Delete from every tenant table with a company_id column. Inter-table FKs
  -- on tenant data (invoice_items → invoices, chat_messages → chat_conversations,
  -- tasks → projects, …) are all ON DELETE CASCADE, so the order across
  -- top-level tenant tables does not matter.
  FOR v_table IN
    SELECT table_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name  = 'company_id'
       AND table_name NOT IN ('companies') -- never self-reference
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE company_id = $1', v_table)
      USING p_company_id;
  END LOOP;

  -- company_settings has both `id` (legacy slug) and `company_id`; the loop
  -- above hits the company_id branch. The legacy id branch is the same value,
  -- so a follow-up delete keyed by id is safe + idempotent for older rows.
  DELETE FROM public.company_settings WHERE id = p_company_id;

  -- Finally, the company row itself. Cascades remove company_members,
  -- chat_conversations + chat_messages, design_photos, quote_designs,
  -- company_documents, and company_audit_log.
  DELETE FROM public.companies WHERE id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_company(TEXT) TO service_role;
