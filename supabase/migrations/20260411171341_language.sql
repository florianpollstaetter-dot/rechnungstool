-- Migration: Add language support, Begleittext, and product translations
-- Run this against the Supabase database before deploying

-- 1. Add language field to invoices (default: German)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'de';

-- 2. Add accompanying_text to invoices (per-invoice override, nullable)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS accompanying_text text;

-- 3. Add English translations to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name_en text NOT NULL DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description_en text NOT NULL DEFAULT '';

-- 4. Add Begleittext (accompanying text) to company settings
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS accompanying_text_de text NOT NULL DEFAULT 'Vielen Dank fuer Ihren Auftrag! Wir freuen uns auf die weitere Zusammenarbeit.';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS accompanying_text_en text NOT NULL DEFAULT 'Thank you for your order! We look forward to our continued collaboration.';

-- 5. Add company_type if missing (was in code but not in DB)
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS company_type text NOT NULL DEFAULT 'gmbh';
