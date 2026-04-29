-- SCH-924 (K2-θ) — Angebote-Erweiterung schema (P2 + P3 + P4).
--
-- P2  Section/heading rows inside a quote (`quote_items.item_type = 'section'`).
-- P3  Quote-level extra detail fields: buyouts, exports_and_delivery, assumptions.
-- P4  Travel-Day item type — references other items in the same quote and bills
--     a configurable percentage of their unit_price (default 50%).
--
-- All columns are additive and idempotent so re-runs are safe.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'quote_items'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'quote_items'
        AND column_name = 'item_type'
    ) THEN
      ALTER TABLE public.quote_items
        ADD COLUMN item_type TEXT NOT NULL DEFAULT 'item';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'quote_items'
        AND column_name = 'travel_day_config'
    ) THEN
      ALTER TABLE public.quote_items
        ADD COLUMN travel_day_config JSONB;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'quotes'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'quotes'
        AND column_name = 'buyouts'
    ) THEN
      ALTER TABLE public.quotes ADD COLUMN buyouts TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'quotes'
        AND column_name = 'exports_and_delivery'
    ) THEN
      ALTER TABLE public.quotes ADD COLUMN exports_and_delivery TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'quotes'
        AND column_name = 'assumptions'
    ) THEN
      ALTER TABLE public.quotes ADD COLUMN assumptions TEXT;
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.quote_items.item_type IS
  'SCH-924 K2-θ — row kind. ''item'' (default) is a normal priced line, '
  '''section'' is a heading/divider that renders without prices and is '
  'excluded from totals, ''travel_day'' is a P4 travel-day line whose '
  'unit_price is computed from referenced items in travel_day_config.';

COMMENT ON COLUMN public.quote_items.travel_day_config IS
  'SCH-924 K2-θ P4 — JSONB shape '
  '{"referenced_item_ids":[uuid,...],"percent":50}. Only set on rows where '
  'item_type = ''travel_day''. The unit_price stored on the row is the '
  'pre-computed sum so PDF/invoice rendering does not need to dereference.';

COMMENT ON COLUMN public.quotes.buyouts IS
  'SCH-924 K2-θ P3 — buyouts/usage-rights clause shown after the pricing '
  'table. Free-form text, optional.';

COMMENT ON COLUMN public.quotes.exports_and_delivery IS
  'SCH-924 K2-θ P3 — deliverables and export formats clause. Free-form '
  'text, optional.';

COMMENT ON COLUMN public.quotes.assumptions IS
  'SCH-924 K2-θ P3 — assumptions/dependencies the quote is based on. '
  'Free-form text, optional.';
