-- SCH-509: seller country on company_settings (E-Rechnung needs configurable seller country)
-- Default 'AT' so existing Austrian companies keep working unchanged.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'AT';
