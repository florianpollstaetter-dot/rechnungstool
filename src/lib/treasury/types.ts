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
