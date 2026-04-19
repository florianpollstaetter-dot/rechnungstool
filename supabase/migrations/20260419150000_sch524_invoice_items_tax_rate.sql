-- SCH-524 — Multi-VAT support: per-line tax rate on invoice_items and quote_items.
-- Existing rows inherit the header tax_rate of their invoice/quote.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'invoice_items') THEN
    ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS tax_rate numeric(6,3) NOT NULL DEFAULT 20;

    UPDATE invoice_items ii
    SET tax_rate = i.tax_rate
    FROM invoices i
    WHERE ii.invoice_id = i.id
      AND ii.tax_rate = 20;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'quote_items') THEN
    ALTER TABLE quote_items
      ADD COLUMN IF NOT EXISTS tax_rate numeric(6,3) NOT NULL DEFAULT 20;

    UPDATE quote_items qi
    SET tax_rate = q.tax_rate
    FROM quotes q
    WHERE qi.quote_id = q.id
      AND qi.tax_rate = 20;
  END IF;
END $$;
