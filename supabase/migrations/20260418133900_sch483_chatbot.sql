-- =============================================================================
-- SCH-483: Customer-facing chatbot with superadmin escalation
-- =============================================================================
-- Phase 1 + 2:
--   * chat_conversations / chat_messages tables, per-company isolation
--   * RLS so users see only their own conversations; superadmin API routes
--     bypass via service_role.
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'escalated', 'resolved', 'closed')),
  escalated_at      TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  last_message_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_role TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_company
  ON chat_conversations(company_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user
  ON chat_conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status
  ON chat_conversations(status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL
                  CHECK (role IN ('user', 'assistant', 'superadmin', 'system')),
  content         TEXT NOT NULL,
  metadata        JSONB,
  author_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, created_at ASC);

-- ---------------------------------------------------------------------------
-- RLS: user owns-their-own-conversation + tenant isolation.
-- Superadmin access flows through service_role in /api/operator/chat/*.
-- ---------------------------------------------------------------------------
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversations_owner" ON chat_conversations;
CREATE POLICY "chat_conversations_owner" ON chat_conversations
  FOR ALL USING (
    user_id = (select auth.uid())
    AND company_id = (select public.active_company_id())
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND company_id = (select public.active_company_id())
  );

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_via_conversation" ON chat_messages;
CREATE POLICY "chat_messages_via_conversation" ON chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND c.user_id = (select auth.uid())
        AND c.company_id = (select public.active_company_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND c.user_id = (select auth.uid())
        AND c.company_id = (select public.active_company_id())
    )
  );
