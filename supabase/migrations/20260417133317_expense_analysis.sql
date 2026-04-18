-- Add AI analysis columns to expense_items (matching receipts pattern)
ALTER TABLE expense_items
  ADD COLUMN IF NOT EXISTS receipt_file_type text,
  ADD COLUMN IF NOT EXISTS account_label text DEFAULT '',
  ADD COLUMN IF NOT EXISTS analysis_status text DEFAULT 'done',
  ADD COLUMN IF NOT EXISTS analysis_raw jsonb,
  ADD COLUMN IF NOT EXISTS analysis_cost numeric;
