-- Migration: Add language and display_mode to quotes
-- Run this against the Supabase database

-- 1. Add language field to quotes (default: German)
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'de';

-- 2. Add display_mode field to quotes (default: detailed)
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'detailed';
