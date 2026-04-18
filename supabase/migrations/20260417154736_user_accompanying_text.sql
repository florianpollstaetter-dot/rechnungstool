-- SCH-409: Per-user accompanying text (Begleittext) for invoices/quotes
-- Allows non-admin users (e.g. accountants) to set their own Begleittext
-- which takes precedence over the company-wide default when they create invoices.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS accompanying_text_de TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS accompanying_text_en TEXT DEFAULT '';
