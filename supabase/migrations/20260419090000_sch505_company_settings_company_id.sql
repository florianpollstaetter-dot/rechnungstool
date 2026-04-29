-- SCH-505: company_settings rows created via self-registration had their
-- `company_id` silently defaulted to 'vrthefans' because the column
-- carried a legacy DEFAULT. `getSettings()` filters by company_id, so
-- those rows never matched the owner's active company and the settings
-- page fell back to DEFAULT_SETTINGS (hardcoded "VR the Fans GmbH").
--
-- Changes:
--   1. Backfill orphaned rows so company_id = id.
--   2. Drop the 'vrthefans' default so future inserts cannot silently
--      inherit the wrong tenant id.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_settings'
      AND column_name = 'company_id'
  ) THEN
    UPDATE public.company_settings
    SET company_id = id
    WHERE company_id IS DISTINCT FROM id;

    ALTER TABLE public.company_settings
      ALTER COLUMN company_id DROP DEFAULT;
  END IF;
END $$;
