-- SCH-424: E-Rechnung fields for ZUGFeRD / XRechnung support
-- Run against the Supabase DB to add e-invoice columns.

-- Add e_invoice_format to invoices (default: none = standard PDF)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS e_invoice_format text NOT NULL DEFAULT 'none';

-- Add leitweg_id to customers (required for XRechnung / B2G)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS leitweg_id text NOT NULL DEFAULT '';

-- Constraint: valid e_invoice_format values
DO $$ BEGIN
  ALTER TABLE invoices
    ADD CONSTRAINT invoices_e_invoice_format_check
    CHECK (e_invoice_format IN ('none', 'zugferd', 'xrechnung'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
