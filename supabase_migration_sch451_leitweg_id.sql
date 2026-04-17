-- SCH-451: Add leitweg_id column to customers
--
-- Fix for: "Could not find the 'leitweg_id' column of 'customers' in the schema cache"
-- when saving AI-created customers.
--
-- Leitweg-ID is used for German B2G e-invoicing (XRechnung).
--
-- Note: This is already included in supabase_migration_einvoice.sql (SCH-424).
-- If that migration was fully applied, this is a no-op thanks to IF NOT EXISTS.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS leitweg_id text NOT NULL DEFAULT '';
