-- =============================================================================
-- SCH-423: Operator Console (Superadmin)
-- =============================================================================
-- Adds superadmin infrastructure:
--   1. is_superadmin flag on user_profiles
--   2. operator_audit_log table for tracking operator actions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add is_superadmin flag to user_profiles
-- ---------------------------------------------------------------------------
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Operator audit log — tracks superadmin actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operator_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id),
  action      TEXT NOT NULL,       -- e.g. 'company.deactivate', 'user.suspend', 'plan.change'
  target_type TEXT NOT NULL,       -- 'company' | 'user' | 'plan'
  target_id   TEXT NOT NULL,       -- the affected entity id
  details     JSONB,              -- additional context
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_audit_log_created
  ON operator_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operator_audit_log_operator
  ON operator_audit_log(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_audit_log_target
  ON operator_audit_log(target_type, target_id);

-- RLS: only service_role can access audit logs (operator API routes use service_role)
ALTER TABLE operator_audit_log ENABLE ROW LEVEL SECURITY;
-- No user-facing policies — all access goes through service_role API routes
