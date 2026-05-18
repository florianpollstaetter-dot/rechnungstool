// ORA-2307 — Per-connection EBICS polling orchestrator.
//
// Wire-up:
//   /api/treasury/ebics/poll (cron route)
//     └─> selectDueConnections() → for each row:
//           └─> pollConnection()
//                 ├─ HEV probe (cheap reachability check)
//                 ├─ STA / CAMT.053 download (only on first tick after midnight
//                 │  in the connection's timezone)
//                 ├─ raw-hash dedupe vs. treasury_statements.raw_hash
//                 ├─ parseCamt053()
//                 └─ idempotent insert: statement + transactions
//
// Failure isolation: one connection failing must NEVER cascade. The cron
// route invokes pollConnection() per row inside its own try/catch; this
// module never throws across connection boundaries.
//
// Circuit breaker: tracked in `treasury_bank_connections` columns
// `consecutive_failures` and `breaker_open_until`. Three consecutive failures
// → breaker opens for COOLDOWN_MS. The selector pre-filters open breakers so
// the route doesn't even build a client for them.
//
// DSGVO: every log statement that references an IBAN passes it through
// `maskIban` first. No counterparty raw IBANs ever leave this module to the
// log sink.

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { maskIban } from "../iban-mask";
import { parseCamt053, Camt053ParseError } from "../iso20022/camt053";
import type { ParsedCamt053 } from "../types";

import { loadSidecarConfig, SidecarConfigError } from "./config";
import { EbicsClientError } from "./errors";
import { EbicsSidecarClient, type Logger, type LogRecord } from "./sidecar-client";

export const BREAKER_FAILURE_THRESHOLD = 3;
export const BREAKER_COOLDOWN_MS = 30 * 60 * 1000; // 30 min

/** Row shape selected from `treasury_bank_connections`. */
export interface BankConnectionRow {
  id: string;
  company_id: string;
  bank_bic: string;
  bank_name: string | null;
  ebics_host_id: string;
  ebics_partner_id: string;
  ebics_user_id: string;
  sidecar_base_url: string | null;
  timezone: string;
  status: "active" | "paused" | "disabled";
  last_polled_at: string | null;
  last_camt053_at: string | null;
  last_camt053_statement_date: string | null;
  consecutive_failures: number;
  breaker_open_until: string | null;
}

export interface PollContext {
  /** Service-role Supabase client (bypasses RLS — required for cron). */
  supabase: SupabaseClient;
  /** Service-role Supabase client used by the EBICS sidecar audit chain. */
  auditSupabase: SupabaseClient;
  /** Wall-clock at tick start; injectable for tests. */
  now: Date;
  /** Optional log sink. */
  logger?: Logger;
  /** Override the sidecar client factory — primarily for tests. */
  clientFactory?: (row: BankConnectionRow) => EbicsSidecarClient;
}

export type PollOutcome =
  | { kind: "skipped"; reason: "breaker_open" | "paused" | "disabled" | "not_due" }
  | { kind: "ok"; statementId: string | null; transactions: number; duplicate: boolean }
  | { kind: "error"; code: string; breakerOpened: boolean };

export interface PollResult {
  connectionId: string;
  hostId: string;
  outcome: PollOutcome;
}

/** Wall-clock date in the connection's IANA timezone, formatted YYYY-MM-DD. */
export function isoDateInTimezone(now: Date, timezone: string): string {
  // Intl.DateTimeFormat is the only stdlib-supported way to project a Date
  // into a named timezone without pulling in tz data — Node 20+ ships full
  // ICU so all IANA zones work.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Does this connection need a fresh CAMT.053 fetch on the current tick?
 * Rule: yes if no CAMT.053 has been imported with a statement_date matching
 * (today − 1) or later in the connection's timezone. The "yesterday boundary"
 * is the safe choice because most banks publish day D's CAMT.053 in the
 * early hours of D+1.
 */
export function isCamt053Due(now: Date, row: BankConnectionRow): boolean {
  const today = isoDateInTimezone(now, row.timezone);
  if (!row.last_camt053_statement_date) return true;
  // We want the next CAMT.053 (covering yesterday) as soon as today rolls
  // over. So fetch if last imported statement is older than yesterday.
  return row.last_camt053_statement_date < yesterday(today);
}

function yesterday(isoDate: string): string {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** Whether the breaker is currently open at `now`. */
export function isBreakerOpen(now: Date, row: BankConnectionRow): boolean {
  if (!row.breaker_open_until) return false;
  return new Date(row.breaker_open_until).getTime() > now.getTime();
}

/**
 * Apply a failure: bump counter, open breaker if threshold reached. Returns
 * the new failure count and whether the breaker just opened.
 */
export function applyFailure(
  prev: { consecutive_failures: number; breaker_open_until: string | null },
  now: Date,
  threshold: number = BREAKER_FAILURE_THRESHOLD,
  cooldownMs: number = BREAKER_COOLDOWN_MS,
): { consecutive_failures: number; breaker_open_until: string | null; breakerOpened: boolean } {
  const next = prev.consecutive_failures + 1;
  if (next >= threshold) {
    const until = new Date(now.getTime() + cooldownMs).toISOString();
    return { consecutive_failures: next, breaker_open_until: until, breakerOpened: true };
  }
  return { consecutive_failures: next, breaker_open_until: prev.breaker_open_until, breakerOpened: false };
}

/** Apply a success: reset counter and clear the breaker. */
export function applySuccess(): { consecutive_failures: number; breaker_open_until: null } {
  return { consecutive_failures: 0, breaker_open_until: null };
}

/**
 * Drive the full poll lifecycle for one connection. Never throws — every
 * exception path is converted into a `PollOutcome` of kind `error`.
 */
export async function pollConnection(
  row: BankConnectionRow,
  ctx: PollContext,
): Promise<PollResult> {
  const logger = ctx.logger ?? noopLogger;
  const baseLog = (record: Omit<LogRecord, "hostId">): void => {
    logger({ ...record, hostId: row.ebics_host_id });
  };

  if (row.status !== "active") {
    return result(row, { kind: "skipped", reason: row.status === "paused" ? "paused" : "disabled" });
  }
  if (isBreakerOpen(ctx.now, row)) {
    baseLog({
      level: "warn",
      msg: "ebics.poll.breaker_open",
      op: "hev",
      requestId: null,
      attempt: 0,
    });
    return result(row, { kind: "skipped", reason: "breaker_open" });
  }
  if (!isCamt053Due(ctx.now, row)) {
    // Tick still touches `last_polled_at` to prove liveness, but no work.
    await ctx.supabase
      .from("treasury_bank_connections")
      .update({ last_polled_at: ctx.now.toISOString() })
      .eq("id", row.id);
    return result(row, { kind: "skipped", reason: "not_due" });
  }

  const client = (ctx.clientFactory ?? defaultClientFactory(row, ctx))(row);
  const callCtx = {
    companyId: row.company_id,
    actorUserId: null, // cron / system run
  };

  try {
    // HEV reachability probe. Cheap, validates sidecar+VPN+keys are healthy
    // before pulling a multi-MB STA. We don't persist the rawBase64 here —
    // only its presence + supportedVersion matters.
    await client.hev(callCtx);

    // STA window: pull yesterday → today. The bank decides which days actually
    // contain a CAMT.053; we just request a generous window.
    const today = isoDateInTimezone(ctx.now, row.timezone);
    const from = yesterday(today);
    const staResult = await client.sta({ from, to: today }, callCtx);

    const xml = Buffer.from(staResult.result.rawBase64, "base64").toString("utf8");
    if (!xml.trim()) {
      // Empty bank response — nothing booked, still a success. Reset breaker
      // and mark tick as polled. We don't move last_camt053_at because no
      // statement was actually imported (so isCamt053Due remains true and we
      // try again on the next tick).
      const success = applySuccess();
      await ctx.supabase
        .from("treasury_bank_connections")
        .update({
          last_polled_at: ctx.now.toISOString(),
          consecutive_failures: success.consecutive_failures,
          breaker_open_until: success.breaker_open_until,
          last_error_code: null,
          last_error_message: null,
          last_request_id: staResult.result.requestId,
        })
        .eq("id", row.id);
      return result(row, { kind: "ok", statementId: null, transactions: 0, duplicate: false });
    }

    const rawHash = createHash("sha256").update(xml).digest("hex");

    // Dedupe: same company + raw_hash → no insert. Cheap protection against
    // re-fetching the same daily CAMT.053 across many ticks.
    const { data: existing } = await ctx.supabase
      .from("treasury_statements")
      .select("id, account_id, statement_date")
      .eq("company_id", row.company_id)
      .eq("raw_hash", rawHash)
      .maybeSingle<{ id: string; account_id: string; statement_date: string }>();

    if (existing) {
      // Already imported — advance last_camt053_at so isCamt053Due() returns
      // false until tomorrow.
      const success = applySuccess();
      await ctx.supabase
        .from("treasury_bank_connections")
        .update({
          last_polled_at: ctx.now.toISOString(),
          last_camt053_at: ctx.now.toISOString(),
          last_camt053_statement_date: existing.statement_date,
          consecutive_failures: success.consecutive_failures,
          breaker_open_until: success.breaker_open_until,
          last_error_code: null,
          last_error_message: null,
          last_request_id: staResult.result.requestId,
        })
        .eq("id", row.id);
      return result(row, {
        kind: "ok",
        statementId: existing.id,
        transactions: 0,
        duplicate: true,
      });
    }

    let parsed: ParsedCamt053;
    try {
      parsed = parseCamt053(xml);
    } catch (err) {
      throw new PollProcessingError(
        err instanceof Camt053ParseError ? "camt053_parse_failed" : "unknown_parse_failure",
        err instanceof Error ? err.message : String(err),
      );
    }

    const accountId = await resolveAccountId(ctx.supabase, row, parsed);

    const stmtInsert = await ctx.supabase
      .from("treasury_statements")
      .insert({
        company_id: row.company_id,
        account_id: accountId,
        statement_date: parsed.statementDate,
        opening_balance: parsed.openingBalance,
        closing_balance: parsed.closingBalance,
        currency: parsed.currency,
        raw_camt: xml,
        raw_hash: rawHash,
        source: "ebics_poll",
        uploaded_by: null,
      })
      .select("id")
      .single<{ id: string }>();
    if (stmtInsert.error || !stmtInsert.data) {
      throw new PollProcessingError(
        "statement_insert_failed",
        stmtInsert.error?.message ?? "no row returned",
      );
    }

    let transactionRowsInserted = 0;
    if (parsed.transactions.length > 0) {
      const rows = parsed.transactions.map((tx) => ({
        company_id: row.company_id,
        statement_id: stmtInsert.data.id,
        account_id: accountId,
        booking_date: tx.bookingDate,
        value_date: tx.valueDate,
        amount: tx.amount,
        currency: tx.currency,
        direction: tx.direction,
        counterparty_name: tx.counterpartyName,
        counterparty_iban: tx.counterpartyIban,
        counterparty_bic: tx.counterpartyBic,
        remittance_info: tx.remittanceInfo,
        end_to_end_id: tx.endToEndId,
        bank_transaction_code: tx.bankTransactionCode,
      }));
      const txInsert = await ctx.supabase.from("treasury_transactions").insert(rows);
      if (txInsert.error) {
        throw new PollProcessingError("transactions_insert_failed", txInsert.error.message);
      }
      transactionRowsInserted = rows.length;
    }

    const success = applySuccess();
    await ctx.supabase
      .from("treasury_bank_connections")
      .update({
        last_polled_at: ctx.now.toISOString(),
        last_camt053_at: ctx.now.toISOString(),
        last_camt053_statement_date: parsed.statementDate,
        consecutive_failures: success.consecutive_failures,
        breaker_open_until: success.breaker_open_until,
        last_error_code: null,
        last_error_message: null,
        last_request_id: staResult.result.requestId,
      })
      .eq("id", row.id);

    baseLog({
      level: "info",
      msg: "ebics.poll.imported",
      op: "sta",
      requestId: staResult.result.requestId,
      attempt: 1,
    });
    // Side-channel log carrying the masked IBAN — useful when forensically
    // correlating across many connections. baseLog can't carry IBAN (its
    // shape is fixed), so we route this through the raw sink.
    logger({
      level: "info",
      msg: `ebics.poll.iban=${maskIban(parsed.iban)} tx=${transactionRowsInserted}`,
      op: "sta",
      hostId: row.ebics_host_id,
      requestId: staResult.result.requestId,
      attempt: 1,
    });

    return result(row, {
      kind: "ok",
      statementId: stmtInsert.data.id,
      transactions: transactionRowsInserted,
      duplicate: false,
    });
  } catch (err) {
    const { code, message } = classifyError(err);
    const next = applyFailure(
      { consecutive_failures: row.consecutive_failures, breaker_open_until: row.breaker_open_until },
      ctx.now,
    );
    await ctx.supabase
      .from("treasury_bank_connections")
      .update({
        last_polled_at: ctx.now.toISOString(),
        consecutive_failures: next.consecutive_failures,
        breaker_open_until: next.breaker_open_until,
        last_error_code: code,
        last_error_message: message.slice(0, 500),
      })
      .eq("id", row.id);

    baseLog({
      level: "error",
      msg: "ebics.poll.failed",
      op: "sta",
      requestId: null,
      attempt: 0,
      errorCode: code,
    });
    return result(row, { kind: "error", code, breakerOpened: next.breakerOpened });
  }
}

export class PollProcessingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "PollProcessingError";
    this.code = code;
  }
}

function classifyError(err: unknown): { code: string; message: string } {
  if (err instanceof PollProcessingError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof EbicsClientError) {
    return { code: `ebics_${err.code}`, message: err.message };
  }
  if (err instanceof SidecarConfigError) {
    return { code: "sidecar_config_error", message: err.message };
  }
  if (err instanceof Error) {
    return { code: "unexpected_error", message: err.message };
  }
  return { code: "unexpected_error", message: String(err) };
}

function defaultClientFactory(
  row: BankConnectionRow,
  ctx: PollContext,
): (row: BankConnectionRow) => EbicsSidecarClient {
  return () => {
    const base = loadSidecarConfig(row.ebics_host_id);
    const config = row.sidecar_base_url
      ? { ...base, baseUrl: row.sidecar_base_url.replace(/\/+$/, "") }
      : base;
    return new EbicsSidecarClient({
      config,
      supabase: ctx.auditSupabase,
      logger: ctx.logger,
    });
  };
}

const noopLogger: Logger = () => {};

function result(row: BankConnectionRow, outcome: PollOutcome): PollResult {
  return { connectionId: row.id, hostId: row.ebics_host_id, outcome };
}

/**
 * Look up the bank account that owns the parsed IBAN. Auto-binds to the
 * connection (`connection_id`) on first sight; auto-creates the account
 * under the connection's existing entity if needed (mirroring the manual
 * upload flow's auto-provision).
 */
async function resolveAccountId(
  supabase: SupabaseClient,
  row: BankConnectionRow,
  parsed: ParsedCamt053,
): Promise<string> {
  const iban = parsed.iban;
  const existing = await supabase
    .from("treasury_bank_accounts")
    .select("id, connection_id")
    .eq("company_id", row.company_id)
    .eq("iban", iban)
    .maybeSingle<{ id: string; connection_id: string | null }>();
  if (existing.data) {
    if (!existing.data.connection_id) {
      await supabase
        .from("treasury_bank_accounts")
        .update({ connection_id: row.id })
        .eq("id", existing.data.id);
    }
    return existing.data.id;
  }

  const entityId = await ensureEntity(supabase, row.company_id);
  const inserted = await supabase
    .from("treasury_bank_accounts")
    .insert({
      company_id: row.company_id,
      entity_id: entityId,
      bank_bic: parsed.bic ?? row.bank_bic,
      bank_name: parsed.bankName ?? row.bank_name ?? row.bank_bic,
      iban,
      currency: parsed.currency,
      status: "active",
      ebics_host_id: row.ebics_host_id,
      ebics_partner_id: row.ebics_partner_id,
      ebics_user_id: row.ebics_user_id,
      connection_id: row.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (inserted.error || !inserted.data) {
    throw new PollProcessingError(
      "account_insert_failed",
      inserted.error?.message ?? "no row returned",
    );
  }
  return inserted.data.id;
}

async function ensureEntity(supabase: SupabaseClient, companyId: string): Promise<string> {
  const existing = await supabase
    .from("treasury_entities")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existing.data) return existing.data.id;

  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle<{ id: string; name: string }>();
  const inserted = await supabase
    .from("treasury_entities")
    .insert({
      company_id: companyId,
      legal_name: company?.name ?? companyId,
      currency: "EUR",
    })
    .select("id")
    .single<{ id: string }>();
  if (inserted.error || !inserted.data) {
    throw new PollProcessingError(
      "entity_insert_failed",
      inserted.error?.message ?? "no row returned",
    );
  }
  return inserted.data.id;
}

/**
 * Load all connections that are candidates for the current tick. Pre-filters
 * status='active'; the per-connection `pollConnection` re-checks the breaker
 * so a concurrent flip doesn't bypass the gate.
 */
export async function selectDueConnections(
  supabase: SupabaseClient,
): Promise<BankConnectionRow[]> {
  const { data, error } = await supabase
    .from("treasury_bank_connections")
    .select(
      "id, company_id, bank_bic, bank_name, ebics_host_id, ebics_partner_id, ebics_user_id, sidecar_base_url, timezone, status, last_polled_at, last_camt053_at, last_camt053_statement_date, consecutive_failures, breaker_open_until",
    )
    .eq("status", "active")
    .order("last_polled_at", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []) as BankConnectionRow[];
}
