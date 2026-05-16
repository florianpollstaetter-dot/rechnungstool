-- =============================================================================
-- ORA-2283: Treasury Phase 0+1 — Foundation Schema
-- =============================================================================
-- Schema-Skizze: rechnungstool/deliverables/08 § 4
-- Scope: Phase 0 (Repo) + Phase 1 (DB-Schema + RLS) + Phase 2 prep (Read-only
-- Cash-View über manuelles CAMT.053-Upload).
--
-- Subscription-Gating: `company_subscriptions` ist die Quelle der Wahrheit für
-- die Sichtbarkeit des Treasury-Moduls. Die Spalte `has_treasury` wird vom
-- Stripe-Hook gesetzt (in einer späteren Phase). Default = false ⇒ Treasury
-- bleibt unsichtbar, RLS blockt Reads, Middleware liefert 404.
--
-- Idempotent: alle CREATEs nutzen `IF NOT EXISTS` und `ON CONFLICT DO NOTHING`.
-- Reversibel via 20260516_treasury_schema_down.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Subscription-Flag-Tabelle
-- ---------------------------------------------------------------------------
-- 1:1 mit `companies`. Default-Werte hinterlegen Orange-Octo-only-Verhalten;
-- Treasury wird explizit aktiviert.
CREATE TABLE IF NOT EXISTS company_subscriptions (
  company_id     TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  has_octo       BOOLEAN NOT NULL DEFAULT TRUE,
  has_treasury   BOOLEAN NOT NULL DEFAULT FALSE,
  treasury_tier  TEXT CHECK (treasury_tier IS NULL OR treasury_tier IN ('starter', 'pro', 'enterprise')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_has_treasury
  ON company_subscriptions(has_treasury) WHERE has_treasury = TRUE;

-- Seed: bestehende Companies bekommen einen Default-Eintrag (has_octo=true,
-- has_treasury=false). Idempotent über ON CONFLICT.
INSERT INTO company_subscriptions (company_id, has_octo, has_treasury)
  SELECT id, TRUE, FALSE FROM companies
  ON CONFLICT (company_id) DO NOTHING;

ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: Mitglieder sehen den Eintrag ihrer eigenen Company.
CREATE POLICY "company_subscriptions_select" ON company_subscriptions
  FOR SELECT USING (
    company_id = (select public.active_company_id())
    AND public.user_is_company_member(company_id)
  );

-- INSERT/UPDATE/DELETE: nur service_role (Stripe-Webhook). Keine user-facing
-- Policies → authenticated kann nicht schreiben.

-- Helper-Function: prüft `has_treasury` für die aktive Company aus dem JWT.
-- Wird von Middleware + lib/treasury/feature-flag.ts genutzt.
CREATE OR REPLACE FUNCTION public.active_company_has_treasury()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT has_treasury FROM company_subscriptions
       WHERE company_id = public.active_company_id()),
    FALSE
  );
$$;
GRANT EXECUTE ON FUNCTION public.active_company_has_treasury TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Treasury-Entities (Konzern-Hierarchie)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_entities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES treasury_entities(id) ON DELETE SET NULL,
  legal_name      TEXT NOT NULL,
  legal_form      TEXT,             -- GmbH/AG/SE/KGaA/Ltd./BV
  country         CHAR(2),
  vat_id          TEXT,
  fiscal_year_end DATE,
  currency        CHAR(3) NOT NULL DEFAULT 'EUR',
  is_inhouse_bank BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_entities_company_id
  ON treasury_entities(company_id);

-- ---------------------------------------------------------------------------
-- 2. Bank Account Management (BAM)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_bank_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id         UUID NOT NULL REFERENCES treasury_entities(id) ON DELETE RESTRICT,
  bank_bic          TEXT NOT NULL,
  bank_name         TEXT NOT NULL,
  iban              TEXT NOT NULL,
  currency          CHAR(3) NOT NULL,
  account_type      TEXT,           -- current / savings / escrow / loan
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'closing', 'closed')),
  ebics_partner_id  TEXT,
  ebics_user_id     TEXT,
  ebics_host_id     TEXT,
  hsm_key_label     TEXT,
  opened_at         DATE,
  closed_at         DATE,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_bank_accounts_company_id
  ON treasury_bank_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_treasury_bank_accounts_entity_id
  ON treasury_bank_accounts(entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_bank_accounts_company_iban
  ON treasury_bank_accounts(company_id, iban);

CREATE TABLE IF NOT EXISTS treasury_account_signers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id               UUID NOT NULL REFERENCES treasury_bank_accounts(id) ON DELETE CASCADE,
  user_id                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signer_name              TEXT NOT NULL,
  signer_email             TEXT,
  ebics_user_id            TEXT,
  signature_class          TEXT CHECK (signature_class IS NULL OR signature_class IN ('A', 'B', 'E', 'T')),
  single_signature_limit   NUMERIC(18,2),
  joint_signature_required BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from               DATE,
  valid_to                 DATE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_account_signers_account_id
  ON treasury_account_signers(account_id);
CREATE INDEX IF NOT EXISTS idx_treasury_account_signers_company_id
  ON treasury_account_signers(company_id);

-- ---------------------------------------------------------------------------
-- 3. Bank-Statements + Transactions (CAMT.053 / CAMT.052)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_statements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES treasury_bank_accounts(id) ON DELETE CASCADE,
  statement_date   DATE NOT NULL,
  opening_balance  NUMERIC(18,2) NOT NULL,
  closing_balance  NUMERIC(18,2) NOT NULL,
  currency         CHAR(3) NOT NULL,
  raw_camt         TEXT,             -- Original-CAMT.053-XML (Audit)
  raw_hash         TEXT NOT NULL,    -- SHA-256(raw_camt)
  source           TEXT NOT NULL DEFAULT 'manual_upload'
                   CHECK (source IN ('manual_upload', 'ebics_poll', 'api_push')),
  uploaded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_statements_company_id
  ON treasury_statements(company_id);
CREATE INDEX IF NOT EXISTS idx_treasury_statements_account_date
  ON treasury_statements(account_id, statement_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_statements_raw_hash
  ON treasury_statements(company_id, raw_hash);

CREATE TABLE IF NOT EXISTS treasury_transactions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  statement_id             UUID REFERENCES treasury_statements(id) ON DELETE CASCADE,
  account_id               UUID NOT NULL REFERENCES treasury_bank_accounts(id) ON DELETE CASCADE,
  booking_date             DATE,
  value_date               DATE,
  amount                   NUMERIC(18,2) NOT NULL,
  currency                 CHAR(3) NOT NULL,
  direction                TEXT NOT NULL CHECK (direction IN ('CRDT', 'DBIT')),
  counterparty_name        TEXT,
  counterparty_iban        TEXT,
  counterparty_bic         TEXT,
  remittance_info          TEXT,
  end_to_end_id            TEXT,
  bank_transaction_code    TEXT,
  matched_payment_id       UUID,
  matched_forecast_item_id UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_transactions_company_id
  ON treasury_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_treasury_transactions_account_date
  ON treasury_transactions(account_id, booking_date DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_transactions_statement_id
  ON treasury_transactions(statement_id);

-- ---------------------------------------------------------------------------
-- 4. Payment-Runs + 4-Augen-Workflow (Schema only; Phase 5 füllt das mit Leben)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_payment_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id           UUID NOT NULL REFERENCES treasury_entities(id) ON DELETE RESTRICT,
  account_id          UUID NOT NULL REFERENCES treasury_bank_accounts(id) ON DELETE RESTRICT,
  scheme              TEXT NOT NULL
                      CHECK (scheme IN ('SEPA-CT', 'SEPA-DD', 'SCT-Inst', 'DTAZV', 'SWIFT-MX')),
  payment_count       INT NOT NULL DEFAULT 0,
  total_amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency            CHAR(3) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'pending_approval', 'approved', 'signed', 'sent', 'acknowledged', 'rejected')),
  initiator_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signer_user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pain_xml            TEXT,
  pain_signed_xml     TEXT,
  pain_hash           TEXT,
  ebics_transfer_id   TEXT,
  bank_status_pain002 TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_payment_runs_company_id
  ON treasury_payment_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_treasury_payment_runs_status
  ON treasury_payment_runs(company_id, status);

CREATE TABLE IF NOT EXISTS treasury_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  run_id            UUID NOT NULL REFERENCES treasury_payment_runs(id) ON DELETE CASCADE,
  end_to_end_id     TEXT NOT NULL,
  beneficiary_name  TEXT NOT NULL,
  beneficiary_iban  TEXT NOT NULL,
  beneficiary_bic   TEXT,
  amount            NUMERIC(18,2) NOT NULL,
  currency          CHAR(3) NOT NULL,
  remittance_info   TEXT,
  category          TEXT,
  sanctions_hit_id  UUID,
  vop_status        TEXT CHECK (vop_status IS NULL OR vop_status IN ('ok', 'mismatch', 'unknown')),
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_payments_company_id
  ON treasury_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_treasury_payments_run_id
  ON treasury_payments(run_id);

CREATE TABLE IF NOT EXISTS treasury_approval_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id           UUID REFERENCES treasury_entities(id) ON DELETE CASCADE,
  account_id          UUID REFERENCES treasury_bank_accounts(id) ON DELETE CASCADE,
  scheme              TEXT,
  min_amount          NUMERIC(18,2),
  max_amount          NUMERIC(18,2),
  required_approvers  INT NOT NULL DEFAULT 2,
  required_signers    INT NOT NULL DEFAULT 1,
  required_role       TEXT,
  priority            INT NOT NULL DEFAULT 100,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_approval_rules_company_id
  ON treasury_approval_rules(company_id);

-- ---------------------------------------------------------------------------
-- 5. Sanctions
-- ---------------------------------------------------------------------------
-- Listen + Einträge sind global (nicht company_scoped). Hits sind company_scoped.
CREATE TABLE IF NOT EXISTS treasury_sanctions_lists (
  id           TEXT PRIMARY KEY,         -- 'eu_consolidated', 'ofac_sdn', 'uk_ofsi'
  source_url   TEXT,
  last_synced  TIMESTAMPTZ,
  entry_count  INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS treasury_sanctions_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id       TEXT NOT NULL REFERENCES treasury_sanctions_lists(id) ON DELETE CASCADE,
  entity_type   TEXT,
  primary_name  TEXT NOT NULL,
  aliases       TEXT[],
  birth_date    DATE,
  countries     TEXT[],
  raw           JSONB
);
CREATE INDEX IF NOT EXISTS idx_treasury_sanctions_entries_list_id
  ON treasury_sanctions_entries(list_id);
CREATE INDEX IF NOT EXISTS idx_treasury_sanctions_entries_name
  ON treasury_sanctions_entries USING gin(to_tsvector('simple', primary_name));

CREATE TABLE IF NOT EXISTS treasury_sanctions_hits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payment_id         UUID NOT NULL REFERENCES treasury_payments(id) ON DELETE CASCADE,
  list_id            TEXT NOT NULL REFERENCES treasury_sanctions_lists(id),
  entry_id           UUID REFERENCES treasury_sanctions_entries(id) ON DELETE SET NULL,
  match_score        NUMERIC(5,4),
  match_method       TEXT CHECK (match_method IS NULL OR match_method IN ('fuzzy', 'embedding', 'list')),
  status             TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'cleared', 'blocked')),
  resolved_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_reason  TEXT,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_sanctions_hits_company_id
  ON treasury_sanctions_hits(company_id);
CREATE INDEX IF NOT EXISTS idx_treasury_sanctions_hits_payment_id
  ON treasury_sanctions_hits(payment_id);

-- ---------------------------------------------------------------------------
-- 6. Forecast
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_forecast_drivers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id    UUID NOT NULL REFERENCES treasury_entities(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  driver_type  TEXT CHECK (driver_type IS NULL OR driver_type IN ('revenue', 'opex', 'payroll', 'tax', 'capex', 'financing', 'custom')),
  formula      TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_forecast_drivers_company_id
  ON treasury_forecast_drivers(company_id);

CREATE TABLE IF NOT EXISTS treasury_forecast_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES treasury_entities(id) ON DELETE CASCADE,
  horizon_weeks   INT NOT NULL DEFAULT 13,
  scenario        TEXT NOT NULL DEFAULT 'base'
                  CHECK (scenario IN ('base', 'best', 'worst', 'custom')),
  model_version   TEXT,
  mape            NUMERIC(7,4),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_forecast_runs_company_id
  ON treasury_forecast_runs(company_id);

CREATE TABLE IF NOT EXISTS treasury_forecast_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  run_id         UUID NOT NULL REFERENCES treasury_forecast_runs(id) ON DELETE CASCADE,
  account_id     UUID REFERENCES treasury_bank_accounts(id) ON DELETE SET NULL,
  forecast_date  DATE NOT NULL,
  amount         NUMERIC(18,2) NOT NULL,
  currency       CHAR(3) NOT NULL,
  category       TEXT,
  driver_id      UUID REFERENCES treasury_forecast_drivers(id) ON DELETE SET NULL,
  source         TEXT NOT NULL CHECK (source IN ('ml', 'driver', 'manual')),
  confidence     NUMERIC(5,4)
);
CREATE INDEX IF NOT EXISTS idx_treasury_forecast_items_run_id
  ON treasury_forecast_items(run_id);
CREATE INDEX IF NOT EXISTS idx_treasury_forecast_items_company_id
  ON treasury_forecast_items(company_id);

-- ---------------------------------------------------------------------------
-- 7. Audit-Chain (cryptographic append-only)
-- ---------------------------------------------------------------------------
-- Hash-chained Audit-Log. service_role appended; user-Reads über RLS gated.
-- Kein UPDATE/DELETE für authenticated → tamper-evident.
CREATE TABLE IF NOT EXISTS treasury_audit_chain (
  seq            BIGSERIAL PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  event_type     TEXT NOT NULL,
  actor_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload        JSONB NOT NULL,
  previous_hash  TEXT NOT NULL,
  hash           TEXT NOT NULL,
  signature      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_audit_chain_company_seq
  ON treasury_audit_chain(company_id, seq);

-- ---------------------------------------------------------------------------
-- 8. RLS: tenant_isolation auf allen company_scoped Treasury-Tabellen.
-- ---------------------------------------------------------------------------
-- Pattern analog `20260418093458_rls_multi_tenancy.sql`: company_id muss der
-- aktiven Company aus dem JWT entsprechen. Zusätzlich: das has_treasury-Flag
-- muss gesetzt sein — sonst können Treasury-Daten zwar via Migration vorhanden
-- sein, aber kein authenticated User kann sie lesen.

-- Helper-Function: company_scope + Treasury-Feature aktiv.
CREATE OR REPLACE FUNCTION public.treasury_tenant_check(p_company_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_company_id = (select public.active_company_id())
    AND public.active_company_has_treasury()
$$;
GRANT EXECUTE ON FUNCTION public.treasury_tenant_check TO authenticated, anon;

-- Macro: für alle company-scoped Treasury-Tabellen identische Policy.
DO $$
DECLARE
  t TEXT;
  treasury_tables TEXT[] := ARRAY[
    'treasury_entities',
    'treasury_bank_accounts',
    'treasury_account_signers',
    'treasury_statements',
    'treasury_transactions',
    'treasury_payment_runs',
    'treasury_payments',
    'treasury_approval_rules',
    'treasury_sanctions_hits',
    'treasury_forecast_drivers',
    'treasury_forecast_runs',
    'treasury_forecast_items'
  ];
BEGIN
  FOREACH t IN ARRAY treasury_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_select" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_select" ON %I FOR SELECT USING (public.treasury_tenant_check(company_id))',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_insert" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_insert" ON %I FOR INSERT WITH CHECK (public.treasury_tenant_check(company_id))',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_update" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_update" ON %I FOR UPDATE USING (public.treasury_tenant_check(company_id)) WITH CHECK (public.treasury_tenant_check(company_id))',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_delete" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_delete" ON %I FOR DELETE USING (public.treasury_tenant_check(company_id))',
      t
    );
  END LOOP;
END $$;

-- Globale Tabellen (Sanctions-Listen + Einträge): authenticated darf lesen,
-- Writes nur service_role (Sync-Job).
ALTER TABLE treasury_sanctions_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "treasury_sanctions_lists_select" ON treasury_sanctions_lists
  FOR SELECT USING (true);

ALTER TABLE treasury_sanctions_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "treasury_sanctions_entries_select" ON treasury_sanctions_entries
  FOR SELECT USING (true);

-- Audit-Chain: nur SELECT für authenticated; INSERT/UPDATE/DELETE blockiert.
ALTER TABLE treasury_audit_chain ENABLE ROW LEVEL SECURITY;
CREATE POLICY "treasury_audit_chain_select" ON treasury_audit_chain
  FOR SELECT USING (public.treasury_tenant_check(company_id));
-- Keine INSERT/UPDATE/DELETE Policies → tamper-evident für authenticated.
-- Inserts erfolgen ausschließlich via service_role im audit-chain.ts-Helper.
