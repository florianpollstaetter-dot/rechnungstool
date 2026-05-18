-- ORA-2308 — Treasury Phase 3 W3.3: persistente Hausbank-Anbindung pro EBICS-
-- Subscriber. Eine Connection bündelt {Host-URL, Host-ID, Partner-ID, User-ID,
-- Customer-ID, System-ID, Keystore-ID, Order-Types}. Mehrere
-- `treasury_bank_accounts` (IBANs) hängen an einer Connection.
--
-- Felder bewusst NICHT in `treasury_bank_accounts` (W1/W2-Schema) verschoben:
--   - Ein Subscriber hält i.d.R. mehrere IBANs derselben Bank; das auf
--     Account-Ebene zu duplizieren wäre Drift-Quelle.
--   - Setup-State (init/hia/hpb/hkd) ist Subscriber-Scope, nicht Account-Scope.
--   - `account.ebics_host_id` bleibt aus Rückwärtskompatibilitätsgründen
--     erhalten und referenziert künftig optional `connection.host_id`.
--
-- Decoupling: keine FK auf `lib/invoices/*`, kein Cross-Module-Trigger.
-- Reversibel: jede DDL paired mit explizitem DROP; siehe down-Hinweis am Ende.

-- ---------------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_bank_connection (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_preset          TEXT NOT NULL
                       CHECK (bank_preset IN ('erste', 'sparkasse', 'deutsche_bank', 'manual')),
  bank_name            TEXT NOT NULL,
  host_url             TEXT NOT NULL,
  host_id              TEXT NOT NULL,
  partner_id           TEXT NOT NULL,
  user_id              TEXT NOT NULL,
  customer_id          TEXT NOT NULL,
  system_id            TEXT,
  ebics_version        TEXT NOT NULL DEFAULT 'H005'
                       CHECK (ebics_version IN ('H004', 'H005')),
  setup_status         TEXT NOT NULL DEFAULT 'draft'
                       CHECK (setup_status IN (
                         'draft',
                         'init_sent',
                         'letters_pending',
                         'hpb_pending',
                         'hkd_pending',
                         'active',
                         'failed'
                       )),
  keystore_id          TEXT,
  order_types          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  init_order_id        TEXT,
  hia_order_id         TEXT,
  letters_generated_at TIMESTAMPTZ,
  last_hev_version     TEXT,
  last_hpb_at          TIMESTAMPTZ,
  last_poll_at         TIMESTAMPTZ,
  next_poll_at         TIMESTAMPTZ,
  activated_at         TIMESTAMPTZ,
  last_error           TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_bank_connection_company_id
  ON treasury_bank_connection(company_id);

-- Eindeutig pro (company_id, host_id, partner_id, user_id) — verhindert
-- doppelte Subscriber-Rows beim erneuten Setup-Anlauf.
CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_bank_connection_subscriber
  ON treasury_bank_connection(company_id, host_id, partner_id, user_id);

-- ---------------------------------------------------------------------------
-- 2. updated_at-Trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.treasury_bank_connection_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_treasury_bank_connection_updated_at
  ON treasury_bank_connection;
CREATE TRIGGER trg_treasury_bank_connection_updated_at
  BEFORE UPDATE ON treasury_bank_connection
  FOR EACH ROW
  EXECUTE FUNCTION public.treasury_bank_connection_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS — gleiches Pattern wie übrige Treasury-Tabellen (siehe
--    20260516_treasury_schema.sql §8).
-- ---------------------------------------------------------------------------
ALTER TABLE treasury_bank_connection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_select" ON treasury_bank_connection;
CREATE POLICY "tenant_isolation_select" ON treasury_bank_connection
  FOR SELECT USING (public.treasury_tenant_check(company_id));

DROP POLICY IF EXISTS "tenant_isolation_insert" ON treasury_bank_connection;
CREATE POLICY "tenant_isolation_insert" ON treasury_bank_connection
  FOR INSERT WITH CHECK (public.treasury_tenant_check(company_id));

DROP POLICY IF EXISTS "tenant_isolation_update" ON treasury_bank_connection;
CREATE POLICY "tenant_isolation_update" ON treasury_bank_connection
  FOR UPDATE USING (public.treasury_tenant_check(company_id))
  WITH CHECK (public.treasury_tenant_check(company_id));

DROP POLICY IF EXISTS "tenant_isolation_delete" ON treasury_bank_connection;
CREATE POLICY "tenant_isolation_delete" ON treasury_bank_connection
  FOR DELETE USING (public.treasury_tenant_check(company_id));

-- ---------------------------------------------------------------------------
-- 4. Bridge: `treasury_bank_accounts.connection_id` als optionaler Pointer.
--    NULL bis das Konto über den Wizard mit einer Connection verknüpft ist.
-- ---------------------------------------------------------------------------
ALTER TABLE treasury_bank_accounts
  ADD COLUMN IF NOT EXISTS connection_id UUID
    REFERENCES treasury_bank_connection(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_treasury_bank_accounts_connection_id
  ON treasury_bank_accounts(connection_id);

-- ---------------------------------------------------------------------------
-- Down (manuell, falls Rollback nötig):
--   ALTER TABLE treasury_bank_accounts DROP COLUMN IF EXISTS connection_id;
--   DROP TRIGGER IF EXISTS trg_treasury_bank_connection_updated_at
--     ON treasury_bank_connection;
--   DROP FUNCTION IF EXISTS public.treasury_bank_connection_touch_updated_at();
--   DROP TABLE IF EXISTS treasury_bank_connection;
-- ---------------------------------------------------------------------------
