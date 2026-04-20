-- =============================================================================
-- SCH-557: Tenant-admin audit log
-- =============================================================================
-- Tracks actions performed by Firma-Admin users (user_profiles.role = 'admin')
-- inside their own tenant — e.g. resetting an employee's password. Kept
-- separate from operator_audit_log so the security boundary between platform
-- operators and tenant admins stays explicit in the data model.
-- =============================================================================

CREATE TABLE IF NOT EXISTS company_audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action         TEXT NOT NULL,       -- e.g. 'user.set_temp_password', 'user.send_temp_password_email'
  target_type    TEXT NOT NULL,       -- 'user' | 'company' | ...
  target_id      TEXT NOT NULL,       -- the affected entity id
  details        JSONB,               -- optional context
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_audit_log_company
  ON company_audit_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_audit_log_actor
  ON company_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_company_audit_log_target
  ON company_audit_log(target_type, target_id);

ALTER TABLE company_audit_log ENABLE ROW LEVEL SECURITY;
-- No user-facing policies; writes and reads go through service_role API routes.
