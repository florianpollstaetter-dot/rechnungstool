-- =============================================================================
-- SCH-961: In-app Bug-Reporter Phase 1
-- =============================================================================
-- New flag on chat_conversations so the operator console can surface
-- bug-report threads with a "BUG" badge and a dedicated filter tab.
-- Idempotent: safe to re-run.
-- =============================================================================

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS is_bug_report BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_bug_reports
  ON chat_conversations(is_bug_report, last_message_at DESC)
  WHERE is_bug_report = TRUE;
