-- SCH-526 — sevDesk import: preserve foreign reference numbers
--
-- Adds `external_ref` to products and customers so sevDesk `Artikelnummer` /
-- `Kunden-Nr` stays attached to the imported row for traceability and
-- re-import matching. Nullable because all non-imported rows leave it empty.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'products') THEN
    ALTER TABLE products ADD COLUMN IF NOT EXISTS external_ref text;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'customers') THEN
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS external_ref text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_external_ref ON products (company_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_external_ref ON customers (company_id, external_ref) WHERE external_ref IS NOT NULL;
