-- SCH-1030: invoice_number must be unique per company, not globally.
-- Drop the global UNIQUE (invoice_number) and replace with UNIQUE (company_id, invoice_number).
-- Idempotent: re-runs are no-ops.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices'
  ) THEN
    ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'invoices_company_invoice_number_unique'
    ) THEN
      ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_company_invoice_number_unique
        UNIQUE (company_id, invoice_number);
    END IF;
  END IF;
END $$;
