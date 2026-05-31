-- =============================================================================
-- ORA-2307: Treasury Phase 3 W3.2 — Multi-Bank-Polling-Cron + CAMT-Import
-- =============================================================================
-- Adds `treasury_bank_connections`: one row per EBICS subscriber profile
-- (host_id + partner_id + user_id) under a company. The Vercel-Cron worker in
-- `/api/treasury/ebics/poll` fans out across rows where `status = 'active'` and
-- the circuit breaker is closed.
--
-- Why a dedicated table (vs. reusing `treasury_bank_accounts.ebics_host_id`):
--   - Multiple bank accounts at the same bank share one EBICS subscriber, so
--     polling is naturally connection-scoped, not account-scoped.
--   - Circuit-breaker + last-polled state belongs at the connection layer; per
--     account we only care about the imported statements/transactions.
--   - The poller fan-out cardinality is bounded by connection count, not
--     account count — avoids redundant HEV/HKD probes when a bank exposes 10+
--     accounts under one subscriber.
--
-- Idempotent: CREATE … IF NOT EXISTS. Reversible via paired *_down.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS treasury_bank_connections (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_bic                 TEXT NOT NULL,
  bank_name                TEXT,
  ebics_host_id            TEXT NOT NULL,
  ebics_partner_id         TEXT NOT NULL,
  ebics_user_id            TEXT NOT NULL,
  sidecar_base_url         TEXT,
  timezone                 TEXT NOT NULL DEFAULT 'Europe/Vienna',
  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'paused', 'disabled')),
  last_polled_at           TIMESTAMPTZ,
  last_camt053_at          TIMESTAMPTZ,
  last_camt053_statement_date DATE,
  consecutive_failures     INT NOT NULL DEFAULT 0,
  breaker_open_until       TIMESTAMPTZ,
  last_error_code          TEXT,
  last_error_message       TEXT,
  last_request_id          TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_bank_connections_company_id
  ON treasury_bank_connections(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_bank_connections_subscriber
  ON treasury_bank_connections(company_id, ebics_host_id, ebics_partner_id, ebics_user_id);
-- Cron tick selector: status='active' AND breaker closed. Partial index keeps
-- the hot path cheap when most connections are healthy.
CREATE INDEX IF NOT EXISTS idx_treasury_bank_connections_active_due
  ON treasury_bank_connections(company_id, last_polled_at)
  WHERE status = 'active';

-- Optional FK from bank_accounts to their parent EBICS connection. Nullable
-- because Phase 1 manual-upload accounts pre-date connections.
ALTER TABLE treasury_bank_accounts
  ADD COLUMN IF NOT EXISTS connection_id UUID
  REFERENCES treasury_bank_connections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_treasury_bank_accounts_connection_id
  ON treasury_bank_accounts(connection_id);

-- RLS: same tenant-isolation pattern as the rest of the Treasury surface.
ALTER TABLE treasury_bank_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_select" ON treasury_bank_connections;
CREATE POLICY "tenant_isolation_select" ON treasury_bank_connections
  FOR SELECT USING (public.treasury_tenant_check(company_id));

DROP POLICY IF EXISTS "tenant_isolation_insert" ON treasury_bank_connections;
CREATE POLICY "tenant_isolation_insert" ON treasury_bank_connections
  FOR INSERT WITH CHECK (public.treasury_tenant_check(company_id));

DROP POLICY IF EXISTS "tenant_isolation_update" ON treasury_bank_connections;
CREATE POLICY "tenant_isolation_update" ON treasury_bank_connections
  FOR UPDATE USING (public.treasury_tenant_check(company_id))
             WITH CHECK (public.treasury_tenant_check(company_id));

DROP POLICY IF EXISTS "tenant_isolation_delete" ON treasury_bank_connections;
CREATE POLICY "tenant_isolation_delete" ON treasury_bank_connections
  FOR DELETE USING (public.treasury_tenant_check(company_id));
