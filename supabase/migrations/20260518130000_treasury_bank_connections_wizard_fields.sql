-- =============================================================================
-- ORA-2312: Treasury Phase 3 W3.6 — Schema reconciliation
-- =============================================================================
-- Adds the W3.3 wizard's per-row state onto the W3.2 poller table
-- `treasury_bank_connections` (plural). Replaces the abandoned singular
-- `treasury_bank_connection` migration which never reached master.
--
-- Two distinct lifecycles share the row:
--   - `status` (W3.2): operational gate for the poller cron — `active`,
--     `paused`, `disabled`. The poller fan-out filters here.
--   - `setup_status` (W3.6, this migration): subscriber-onboarding state —
--     `draft` → `init_sent` → `letters_pending` → `hpb_pending` →
--     `hkd_pending` → `active` (or `failed`). Drives wizard step resume.
--
-- Idempotent (`ADD COLUMN IF NOT EXISTS`), reversible via paired *_down.sql.
-- =============================================================================

-- bank_bic relax: the W3.2 migration set NOT NULL because the poller seeds
-- rows with a known BIC. The wizard creates rows at "draft" time before the
-- bank issues a BIC, so this is now nullable. Existing rows (if any) keep
-- their value.
ALTER TABLE treasury_bank_connections
  ALTER COLUMN bank_bic DROP NOT NULL;

-- Wizard-specific columns.
ALTER TABLE treasury_bank_connections
  ADD COLUMN IF NOT EXISTS bank_preset TEXT
    CHECK (bank_preset IN ('erste', 'sparkasse', 'deutsche_bank', 'manual')),
  ADD COLUMN IF NOT EXISTS host_url TEXT,
  ADD COLUMN IF NOT EXISTS customer_id TEXT,
  ADD COLUMN IF NOT EXISTS system_id TEXT,
  ADD COLUMN IF NOT EXISTS ebics_version TEXT NOT NULL DEFAULT 'H005'
    CHECK (ebics_version IN ('H004', 'H005')),
  ADD COLUMN IF NOT EXISTS setup_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (setup_status IN (
      'draft',
      'init_sent',
      'letters_pending',
      'hpb_pending',
      'hkd_pending',
      'active',
      'failed'
    )),
  ADD COLUMN IF NOT EXISTS keystore_id TEXT,
  ADD COLUMN IF NOT EXISTS order_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS init_order_id TEXT,
  ADD COLUMN IF NOT EXISTS hia_order_id TEXT,
  ADD COLUMN IF NOT EXISTS letters_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_hev_version TEXT,
  ADD COLUMN IF NOT EXISTS last_hpb_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_poll_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- updated_at maintenance: W3.2 left this caller-managed; the wizard does
-- many in-flight UPDATEs and the audit chain wants a server-authoritative
-- timestamp. A trigger removes the trust assumption.
CREATE OR REPLACE FUNCTION public.treasury_bank_connections_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_treasury_bank_connections_updated_at
  ON treasury_bank_connections;
CREATE TRIGGER trg_treasury_bank_connections_updated_at
  BEFORE UPDATE ON treasury_bank_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.treasury_bank_connections_touch_updated_at();
