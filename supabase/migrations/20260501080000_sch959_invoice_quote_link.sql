-- SCH-959 K3-AB1 — proper FK + percent tracking from invoice → source quote.
--
-- Before this migration, SCH-444 tracked partial-invoice → quote linkage via a
-- `[source_quote:<uuid>]` substring marker appended to `invoices.notes`. That
-- works for "are there any invoices for this quote", but it does not encode
-- *how much* of the quote each invoice represents — which is what the
-- Restprozent-Tracking flow needs.
--
-- This migration:
--   * adds `invoices.source_quote_id` (FK → quotes.id, ON DELETE SET NULL)
--   * adds `invoices.percent_of_quote` numeric(7,4) (0–100, four decimal places
--     so e.g. 33.3333% repeating doesn't lose precision when summed)
--   * backfills `source_quote_id` from the legacy notes marker so existing
--     partial invoices stay linked
--   * indexes `source_quote_id` for the per-quote aggregation query
--
-- All changes are additive and idempotent so the migration is safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoices'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'source_quote_id'
  ) THEN
    ALTER TABLE public.invoices
      ADD COLUMN source_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'percent_of_quote'
  ) THEN
    ALTER TABLE public.invoices
      ADD COLUMN percent_of_quote NUMERIC(7,4);
  END IF;
END $$;

-- Backfill source_quote_id from the legacy [source_quote:<uuid>] marker that
-- SCH-444's InvoiceEditModal appended to `notes`. Only touch rows that don't
-- already have the FK set, and only when the substring matches a valid quote.
UPDATE public.invoices i
SET source_quote_id = sub.qid
FROM (
  SELECT id,
         (regexp_matches(notes, '\[source_quote:([0-9a-f-]{36})\]'))[1]::uuid AS qid
  FROM public.invoices
  WHERE source_quote_id IS NULL
    AND notes ~ '\[source_quote:[0-9a-f-]{36}\]'
) sub
WHERE i.id = sub.id
  AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = sub.qid);

CREATE INDEX IF NOT EXISTS idx_invoices_source_quote_id
  ON public.invoices(source_quote_id)
  WHERE source_quote_id IS NOT NULL;

COMMENT ON COLUMN public.invoices.source_quote_id IS
  'SCH-959 K3-AB1 — FK to the quote this invoice was created from. Replaces '
  'the legacy [source_quote:<uuid>] marker in notes used by SCH-444.';

COMMENT ON COLUMN public.invoices.percent_of_quote IS
  'SCH-959 K3-AB1 — Percent (0–100) of the source quote''s total that this '
  'invoice represents. NULL on legacy/standalone invoices. The remaining '
  'available percent for new partial/Schluss invoices is '
  '100 - SUM(percent_of_quote) over non-cancelled siblings.';
