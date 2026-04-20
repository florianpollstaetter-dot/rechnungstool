-- =============================================================================
-- SCH-562: AI-generated dynamic quote design (Opus 4.7)
-- Adds JSONB payload column to persist AI-generated cover/intro design per quote.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'quote_design_selections') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'quote_design_selections' AND column_name = 'ai_generated_payload'
    ) THEN
      ALTER TABLE quote_design_selections
        ADD COLUMN ai_generated_payload JSONB;
    END IF;
  END IF;
END $$;
