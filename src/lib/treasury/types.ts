// ORA-2283 — Treasury domain types. Mirrors the table shapes in
// `supabase/migrations/20260516_treasury_schema.sql`. Kept inside
// `lib/treasury/` so the module stays self-contained and could be lifted
// into a standalone Treasury-only product without dragging shared types.

export type TreasuryAccountStatus = "active" | "closing" | "closed";
export type TreasuryAccountType = "current" | "savings" | "escrow" | "loan";
export type TreasurySignatureClass = "A" | "B" | "E" | "T";

export interface TreasuryEntity {
  id: string;
  company_id: string;
  parent_id: string | null;
  legal_name: string;
  legal_form: string | null;
  country: string | null;
  vat_id: string | null;
  fiscal_year_end: string | null;
  currency: string;
  is_inhouse_bank: boolean;
  created_at: string;
  updated_at: string;
}

export interface TreasuryBankAccount {
  id: string;
  company_id: string;
  entity_id: string;
  bank_bic: string;
  bank_name: string;
  iban: string;
  currency: string;
  account_type: TreasuryAccountType | null;
  status: TreasuryAccountStatus;
  ebics_partner_id: string | null;
  ebics_user_id: string | null;
  ebics_host_id: string | null;
  hsm_key_label: string | null;
  opened_at: string | null;
  closed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type StatementSource = "manual_upload" | "ebics_poll" | "api_push";

export interface TreasuryStatement {
  id: string;
  company_id: string;
  account_id: string;
  statement_date: string;
  opening_balance: number;
  closing_balance: number;
  currency: string;
  raw_camt: string | null;
  raw_hash: string;
  source: StatementSource;
  uploaded_by: string | null;
  fetched_at: string;
}

export type TransactionDirection = "CRDT" | "DBIT";

export interface TreasuryTransaction {
  id: string;
  company_id: string;
  statement_id: string | null;
  account_id: string;
  booking_date: string | null;
  value_date: string | null;
  amount: number;
  currency: string;
  direction: TransactionDirection;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  counterparty_bic: string | null;
  remittance_info: string | null;
  end_to_end_id: string | null;
  bank_transaction_code: string | null;
  matched_payment_id: string | null;
  matched_forecast_item_id: string | null;
  created_at: string;
}

// ORA-2308 + ORA-2312 — EBICS Hausbank-Anbindung pro Subscriber.
// Mirrors `treasury_bank_connections` (plural) from
// `20260518_treasury_bank_connections.sql` (W3.2 poller fields) plus the
// W3.6 wizard fields from
// `20260518130000_treasury_bank_connections_wizard_fields.sql`. One row per
// EBICS subscriber (Host-ID + Partner-ID + User-ID), N
// `treasury_bank_accounts` (IBANs) attached via `connection_id`.
//
// Two distinct lifecycles share the row:
//   - `status` — operational gate for the poller cron.
//   - `setup_status` — wizard onboarding state machine.

export type EbicsBankPreset = "erste" | "sparkasse" | "deutsche_bank" | "manual";

export type EbicsConnectionStatus =
  | "draft"
  | "init_sent"
  | "letters_pending"
  | "hpb_pending"
  | "hkd_pending"
  | "active"
  | "failed";

export type EbicsVersion = "H004" | "H005";

export type TreasuryConnectionOperationalStatus = "active" | "paused" | "disabled";

export interface TreasuryBankConnection {
  id: string;
  company_id: string;
  // W3.2 poller fields
  bank_bic: string | null;
  bank_name: string | null;
  ebics_host_id: string;
  ebics_partner_id: string;
  ebics_user_id: string;
  sidecar_base_url: string | null;
  timezone: string;
  status: TreasuryConnectionOperationalStatus;
  last_polled_at: string | null;
  last_camt053_at: string | null;
  last_camt053_statement_date: string | null;
  consecutive_failures: number;
  breaker_open_until: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  last_request_id: string | null;
  // W3.6 wizard fields
  bank_preset: EbicsBankPreset | null;
  host_url: string | null;
  customer_id: string | null;
  system_id: string | null;
  ebics_version: EbicsVersion;
  setup_status: EbicsConnectionStatus;
  keystore_id: string | null;
  order_types: string[];
  init_order_id: string | null;
  hia_order_id: string | null;
  letters_generated_at: string | null;
  last_hev_version: string | null;
  last_hpb_at: string | null;
  next_poll_at: string | null;
  activated_at: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanySubscription {
  company_id: string;
  has_octo: boolean;
  has_treasury: boolean;
  treasury_tier: "starter" | "pro" | "enterprise" | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParsedCamt053 {
  iban: string;
  bic: string | null;
  bankName: string | null;
  currency: string;
  statementDate: string;
  openingBalance: number;
  closingBalance: number;
  transactions: ParsedCamtTransaction[];
}

export interface ParsedCamtTransaction {
  amount: number;
  currency: string;
  direction: TransactionDirection;
  bookingDate: string | null;
  valueDate: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  counterpartyBic: string | null;
  remittanceInfo: string | null;
  endToEndId: string | null;
  bankTransactionCode: string | null;
}
