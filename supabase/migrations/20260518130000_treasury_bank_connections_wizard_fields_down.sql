-- ORA-2312 down — revert wizard-field additions to treasury_bank_connections.

DROP TRIGGER IF EXISTS trg_treasury_bank_connections_updated_at
  ON treasury_bank_connections;
DROP FUNCTION IF EXISTS public.treasury_bank_connections_touch_updated_at();

ALTER TABLE treasury_bank_connections
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS activated_at,
  DROP COLUMN IF EXISTS next_poll_at,
  DROP COLUMN IF EXISTS last_hpb_at,
  DROP COLUMN IF EXISTS last_hev_version,
  DROP COLUMN IF EXISTS letters_generated_at,
  DROP COLUMN IF EXISTS hia_order_id,
  DROP COLUMN IF EXISTS init_order_id,
  DROP COLUMN IF EXISTS order_types,
  DROP COLUMN IF EXISTS keystore_id,
  DROP COLUMN IF EXISTS setup_status,
  DROP COLUMN IF EXISTS ebics_version,
  DROP COLUMN IF EXISTS system_id,
  DROP COLUMN IF EXISTS customer_id,
  DROP COLUMN IF EXISTS host_url,
  DROP COLUMN IF EXISTS bank_preset;

-- bank_bic re-enforced — only safe when no NULL rows remain.
ALTER TABLE treasury_bank_connections
  ALTER COLUMN bank_bic SET NOT NULL;
