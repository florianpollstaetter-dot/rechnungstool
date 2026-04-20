-- SCH-572: Spesen upload fails with 'null is not an object (evaluating r.id)'.
-- Root cause: expense_items is missing the analysis-related columns the app
-- writes on insert. Earlier migration 20260417133317_expense_analysis.sql is
-- recorded as applied but the columns are absent in this project — likely a
-- schema divergence from an earlier manual reset. Re-add idempotently so the
-- insert from createExpenseItem() stops returning PGRST 204/400 with no row.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'expense_items') THEN
    ALTER TABLE public.expense_items
      ADD COLUMN IF NOT EXISTS receipt_file_type text,
      ADD COLUMN IF NOT EXISTS account_label    text DEFAULT '',
      ADD COLUMN IF NOT EXISTS analysis_status  text DEFAULT 'done',
      ADD COLUMN IF NOT EXISTS analysis_raw     jsonb,
      ADD COLUMN IF NOT EXISTS analysis_cost    numeric;
  END IF;
END $$;
