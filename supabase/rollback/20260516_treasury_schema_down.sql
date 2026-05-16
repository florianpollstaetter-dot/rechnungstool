-- =============================================================================
-- ORA-2283: Treasury Phase 0+1 — Down-Migration
-- =============================================================================
-- Reversible Cleanup für 20260516_treasury_schema.sql. Wird NICHT automatisch
-- vom Supabase-Migrator ausgeführt — manuell anwenden, wenn ein Rollback
-- nötig ist.
--
-- Reihenfolge: dependent Tabellen zuerst, dann die Tabellen, auf die sie
-- per FK verweisen. Funktionen zuletzt.
-- =============================================================================

DROP TABLE IF EXISTS treasury_audit_chain CASCADE;

DROP TABLE IF EXISTS treasury_forecast_items CASCADE;
DROP TABLE IF EXISTS treasury_forecast_runs CASCADE;
DROP TABLE IF EXISTS treasury_forecast_drivers CASCADE;

DROP TABLE IF EXISTS treasury_sanctions_hits CASCADE;
DROP TABLE IF EXISTS treasury_sanctions_entries CASCADE;
DROP TABLE IF EXISTS treasury_sanctions_lists CASCADE;

DROP TABLE IF EXISTS treasury_approval_rules CASCADE;
DROP TABLE IF EXISTS treasury_payments CASCADE;
DROP TABLE IF EXISTS treasury_payment_runs CASCADE;

DROP TABLE IF EXISTS treasury_transactions CASCADE;
DROP TABLE IF EXISTS treasury_statements CASCADE;

DROP TABLE IF EXISTS treasury_account_signers CASCADE;
DROP TABLE IF EXISTS treasury_bank_accounts CASCADE;
DROP TABLE IF EXISTS treasury_entities CASCADE;

DROP TABLE IF EXISTS company_subscriptions CASCADE;

DROP FUNCTION IF EXISTS public.treasury_tenant_check(TEXT);
DROP FUNCTION IF EXISTS public.active_company_has_treasury();
