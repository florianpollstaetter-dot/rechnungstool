-- Reversal of 20260518_treasury_bank_connections.sql.

ALTER TABLE IF EXISTS treasury_bank_accounts
  DROP COLUMN IF EXISTS connection_id;

DROP INDEX IF EXISTS idx_treasury_bank_accounts_connection_id;
DROP INDEX IF EXISTS idx_treasury_bank_connections_active_due;
DROP INDEX IF EXISTS uq_treasury_bank_connections_subscriber;
DROP INDEX IF EXISTS idx_treasury_bank_connections_company_id;

DROP POLICY IF EXISTS "tenant_isolation_delete" ON treasury_bank_connections;
DROP POLICY IF EXISTS "tenant_isolation_update" ON treasury_bank_connections;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON treasury_bank_connections;
DROP POLICY IF EXISTS "tenant_isolation_select" ON treasury_bank_connections;

DROP TABLE IF EXISTS treasury_bank_connections;
