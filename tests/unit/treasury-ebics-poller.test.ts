// ORA-2307 — Unit tests for the EBICS poll orchestrator.
//
// Run with:
//   npx tsx tests/unit/treasury-ebics-poller.test.ts
//
// Coverage:
//   - applySuccess / applyFailure state transitions
//   - Circuit breaker opens after 3 consecutive failures
//   - isCamt053Due skips on already-imported same-day statements
//   - pollConnection happy path: HEV + STA + parse + insert
//   - Dedupe: second poll of same raw-hash inserts zero new statements
//   - Failure isolation: one connection failing leaves siblings clean
//   - IBAN masking: counterparty IBANs are never logged in cleartext

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EbicsSidecarClient, type LogRecord, type Logger } from "../../src/lib/treasury/ebics";
import {
  applyFailure,
  applySuccess,
  BREAKER_COOLDOWN_MS,
  BREAKER_FAILURE_THRESHOLD,
  isBreakerOpen,
  isCamt053Due,
  isoDateInTimezone,
  pollConnection,
  type BankConnectionRow,
} from "../../src/lib/treasury/ebics/poller";

// ---------------------------------------------------------------------------
// Fixtures — golden CAMT.053 + connection rows.
// ---------------------------------------------------------------------------

function goldenCamt053(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Id>STMT-2026-05-17</Id>
      <CreDtTm>2026-05-17T23:30:00</CreDtTm>
      <Acct>
        <Id><IBAN>AT611904300234573201</IBAN></Id>
        <Ccy>EUR</Ccy>
        <Svcr><FinInstnId><BICFI>BKAUATWWXXX</BICFI><Nm>UniCredit Bank Austria</Nm></FinInstnId></Svcr>
      </Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">10000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-05-17</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">10250.50</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-05-17</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">250.50</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-05-17</Dt></BookgDt>
        <ValDt><Dt>2026-05-17</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-001</EndToEndId></Refs>
            <RltdPties>
              <Dbtr><Nm>Kunde AG</Nm></Dbtr>
              <DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct>
            </RltdPties>
            <RmtInf><Ustrd>Rechnung 2026-001</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
}

function makeRow(overrides: Partial<BankConnectionRow> = {}): BankConnectionRow {
  return {
    id: "conn-1",
    company_id: "co-1",
    bank_bic: "BKAUATWW",
    bank_name: "Bank Austria",
    ebics_host_id: "BANKAT_PROD",
    ebics_partner_id: "P-1",
    ebics_user_id: "U-1",
    sidecar_base_url: "https://sidecar.test",
    timezone: "Europe/Vienna",
    status: "active",
    last_polled_at: null,
    last_camt053_at: null,
    last_camt053_statement_date: null,
    consecutive_failures: 0,
    breaker_open_until: null,
    ...overrides,
  };
}

function collectingLogger(): { log: Logger; records: LogRecord[]; messages: () => string[] } {
  const records: LogRecord[] = [];
  return {
    log: (r) => records.push(r),
    records,
    messages: () => records.map((r) => `${r.level}:${r.msg}`),
  };
}

// ---------------------------------------------------------------------------
// Supabase stub — supports the small read/write surface the poller touches.
// ---------------------------------------------------------------------------

interface Filter {
  field: string;
  op: "eq";
  value: unknown;
}

interface MockSupabaseState {
  treasury_bank_connections: BankConnectionRow[];
  treasury_statements: Array<{
    id: string;
    company_id: string;
    account_id: string;
    statement_date: string;
    opening_balance: number;
    closing_balance: number;
    currency: string;
    raw_camt: string | null;
    raw_hash: string;
    source: string;
    uploaded_by: string | null;
  }>;
  treasury_transactions: Array<Record<string, unknown>>;
  treasury_bank_accounts: Array<{
    id: string;
    company_id: string;
    entity_id: string;
    iban: string;
    bank_bic: string;
    bank_name: string;
    currency: string;
    status: string;
    connection_id: string | null;
    ebics_host_id?: string | null;
  }>;
  treasury_entities: Array<{ id: string; company_id: string; legal_name: string; created_at: string }>;
  companies: Array<{ id: string; name: string }>;
  treasury_audit_chain: Array<Record<string, unknown>>;
}

function newState(): MockSupabaseState {
  return {
    treasury_bank_connections: [],
    treasury_statements: [],
    treasury_transactions: [],
    treasury_bank_accounts: [],
    treasury_entities: [],
    companies: [{ id: "co-1", name: "Co One GmbH" }],
    treasury_audit_chain: [],
  };
}

let pkSeq = 1;
function nextId(prefix: string): string {
  pkSeq += 1;
  return `${prefix}-${pkSeq}`;
}

function makeSupabase(state: MockSupabaseState): SupabaseClient {
  // The Supabase JS client uses a fluent chain of typed methods; modelling
  // every overload here would be ~150 lines for zero forensic value, so we
  // type the chain as `unknown` internally and let the cast-to-SupabaseClient
  // at the bottom enforce the public shape. The tests then verify the
  // observable behaviour (row inserts, filters, updates).
  const builder = (table: string) => {
    const filters: Filter[] = [];
    let pendingInsert: Record<string, unknown> | Array<Record<string, unknown>> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;
    let orderField: { field: string; ascending: boolean } | null = null;
    let limitN: number | null = null;
    const tableKey = table as keyof MockSupabaseState;

    const rows = (): Array<Record<string, unknown>> => state[tableKey] as Array<Record<string, unknown>>;

    const applyFilters = (): Array<Record<string, unknown>> => {
      let xs = rows().slice();
      for (const f of filters) xs = xs.filter((r) => r[f.field] === f.value);
      if (orderField) {
        const ord = orderField;
        const dir = ord.ascending ? 1 : -1;
        xs.sort((a, b) => {
          const av = a[ord.field];
          const bv = b[ord.field];
          if (av === bv) return 0;
          if (av == null) return -dir;
          if (bv == null) return dir;
          return av < bv ? -dir : dir;
        });
      }
      if (limitN != null) xs = xs.slice(0, limitN);
      return xs;
    };

    interface ChainApi {
      select(cols: string): ChainApi;
      eq(field: string, value: unknown): ChainApi;
      order(field: string, opts: { ascending?: boolean }): ChainApi;
      limit(n: number): ChainApi;
      maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }>;
      single(): Promise<{ data: Record<string, unknown> | null; error: null }>;
      insert(payload: Record<string, unknown> | Array<Record<string, unknown>>): unknown;
      update(values: Record<string, unknown>): unknown;
    }

    const api: ChainApi = {
      select(_cols: string): ChainApi {
        return api;
      },
      eq(field: string, value: unknown): ChainApi {
        filters.push({ field, op: "eq", value });
        return api;
      },
      order(field: string, opts: { ascending?: boolean }): ChainApi {
        orderField = { field, ascending: opts.ascending !== false };
        return api;
      },
      limit(n: number): ChainApi {
        limitN = n;
        return api;
      },
      async maybeSingle() {
        const matched = applyFilters();
        return { data: matched[0] ?? null, error: null as null };
      },
      async single() {
        if (pendingInsert) {
          const row = Array.isArray(pendingInsert) ? pendingInsert[0]! : pendingInsert;
          const withId: Record<string, unknown> = { id: row.id ?? nextId(tableKey), ...row };
          rows().push(withId);
          pendingInsert = null;
          return { data: withId, error: null as null };
        }
        const matched = applyFilters();
        return { data: matched[0] ?? null, error: null as null };
      },
      insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
        pendingInsert = payload;
        if (Array.isArray(payload)) {
          for (const row of payload) {
            rows().push({ id: nextId(tableKey), ...row });
          }
          pendingInsert = null;
          return Promise.resolve({ data: null, error: null });
        }
        const thenable = {
          ...api,
          then(resolve: (v: { data: null; error: null }) => unknown) {
            const row = pendingInsert as Record<string, unknown>;
            rows().push({ id: nextId(tableKey), ...row });
            pendingInsert = null;
            return Promise.resolve(resolve({ data: null, error: null }));
          },
        };
        return thenable;
      },
      update(values: Record<string, unknown>) {
        pendingUpdate = values;
        interface UpdateThenable {
          eq(field: string, value: unknown): UpdateThenable;
          then(resolve: (v: { data: null; error: null }) => unknown): Promise<unknown>;
        }
        const thenable: UpdateThenable = {
          eq(field: string, value: unknown) {
            filters.push({ field, op: "eq", value });
            return thenable;
          },
          then(resolve: (v: { data: null; error: null }) => unknown) {
            const matched = applyFilters();
            for (const r of matched) Object.assign(r, pendingUpdate);
            pendingUpdate = null;
            return Promise.resolve(resolve({ data: null, error: null }));
          },
        };
        return thenable;
      },
    };
    return api;
  };

  return { from: builder } as unknown as SupabaseClient;
}

// Build a "client factory" that returns an EbicsSidecarClient backed by a
// stubbed fetch returning a fixed STA payload. Avoids exercising the
// retry/audit path here — the sidecar-client suite already covers that.
interface FakeClientOptions {
  staXml?: string | (() => string);
  failHev?: Error;
  failSta?: Error;
}

function makeClientFactory(opts: FakeClientOptions = {}): (row: BankConnectionRow) => EbicsSidecarClient {
  return (row: BankConnectionRow) => {
    const fetchFn: typeof fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      const method = init?.method ?? "GET";
      void method;
      if (url.includes("/ebics/hev")) {
        if (opts.failHev) throw opts.failHev;
        return new Response(
          JSON.stringify({
            requestId: "req-hev",
            rawBase64: "AAA=",
            rawBytes: 2,
            supportedVersion: "H005",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/ebics/sta")) {
        if (opts.failSta) throw opts.failSta;
        const xml = typeof opts.staXml === "function" ? opts.staXml() : opts.staXml ?? goldenCamt053();
        const rawBase64 = Buffer.from(xml, "utf8").toString("base64");
        return new Response(
          JSON.stringify({
            requestId: "req-sta",
            rawBase64,
            rawBytes: Buffer.byteLength(xml, "utf8"),
            from: "2026-05-17",
            to: "2026-05-18",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    };

    return new EbicsSidecarClient({
      config: {
        hostId: row.ebics_host_id,
        baseUrl: row.sidecar_base_url ?? "https://sidecar.test",
        bearerToken: "tkn",
        timeoutMs: 2_000,
        maxAttempts: 2,
        baseBackoffMs: 1,
      },
      // The audit chain is exercised separately. For the poller we just need
      // any Supabase-shaped object that accepts inserts; the existing
      // makeSupabase stub does not implement the `treasury_audit_chain`
      // `.filter()` jsonb path. We pass a no-op stub instead.
      supabase: noopAuditSupabase(),
      fetchFn,
      logger: () => {},
    });
  };
}

function noopAuditSupabase(): SupabaseClient {
  // Single-call surface tailored for `writeEbicsAuditChainEntry`. Always
  // claims "row already exists" so no insert happens.
  const builder = () => {
    const api: Record<string, (...args: unknown[]) => unknown> = {
      select: () => api,
      eq: () => api,
      filter: () => api,
      maybeSingle: async () => ({ data: { seq: 1 }, error: null as null }),
      insert: () => ({
        select: () => ({ single: async () => ({ data: { seq: 1 }, error: null as null }) }),
      }),
    };
    return api;
  };
  return { from: builder } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function test_applyFailure_opens_breaker_at_threshold(): Promise<void> {
  const now = new Date("2026-05-18T12:00:00Z");
  let state = { consecutive_failures: 0, breaker_open_until: null as string | null };
  for (let i = 0; i < BREAKER_FAILURE_THRESHOLD - 1; i += 1) {
    const next = applyFailure(state, now);
    assert.equal(next.breakerOpened, false, `prematurely opened at ${i + 1}`);
    state = { consecutive_failures: next.consecutive_failures, breaker_open_until: next.breaker_open_until };
  }
  const final = applyFailure(state, now);
  assert.equal(final.breakerOpened, true);
  assert.equal(final.consecutive_failures, BREAKER_FAILURE_THRESHOLD);
  assert.ok(final.breaker_open_until);
  // Should be ~30 min in the future.
  const expectedUntil = now.getTime() + BREAKER_COOLDOWN_MS;
  assert.equal(new Date(final.breaker_open_until!).getTime(), expectedUntil);
}

function test_applySuccess_resets_state(): void {
  const out = applySuccess();
  assert.equal(out.consecutive_failures, 0);
  assert.equal(out.breaker_open_until, null);
}

function test_isBreakerOpen_respects_until(): void {
  const now = new Date("2026-05-18T12:00:00Z");
  assert.equal(isBreakerOpen(now, makeRow({ breaker_open_until: null })), false);
  assert.equal(
    isBreakerOpen(now, makeRow({ breaker_open_until: "2026-05-18T11:59:00Z" })),
    false,
    "expired breaker should be closed",
  );
  assert.equal(
    isBreakerOpen(now, makeRow({ breaker_open_until: "2026-05-18T12:30:00Z" })),
    true,
    "future breaker should be open",
  );
}

function test_isoDateInTimezone(): void {
  // 2026-05-18 22:30 UTC is 2026-05-19 00:30 in Vienna.
  const out = isoDateInTimezone(new Date("2026-05-18T22:30:00Z"), "Europe/Vienna");
  assert.equal(out, "2026-05-19");
}

function test_isCamt053Due(): void {
  const now = new Date("2026-05-18T08:00:00Z");
  // No previous → due.
  assert.equal(isCamt053Due(now, makeRow()), true);
  // Already have today's statement → not due.
  assert.equal(isCamt053Due(now, makeRow({ last_camt053_statement_date: "2026-05-18" })), false);
  // Yesterday's statement → not due (we'd be fetching today, but today's not
  // typically available until the next day's first tick).
  assert.equal(isCamt053Due(now, makeRow({ last_camt053_statement_date: "2026-05-17" })), false);
  // Two-day-old → due.
  assert.equal(isCamt053Due(now, makeRow({ last_camt053_statement_date: "2026-05-15" })), true);
}

async function test_pollConnection_happy_path(): Promise<void> {
  const state = newState();
  const row = makeRow();
  state.treasury_bank_connections.push(row);
  const supabase = makeSupabase(state);
  const { log, records } = collectingLogger();
  const now = new Date("2026-05-18T08:00:00Z");

  const out = await pollConnection(row, {
    supabase,
    auditSupabase: supabase,
    now,
    logger: log,
    clientFactory: makeClientFactory(),
  });
  assert.equal(out.outcome.kind, "ok");
  if (out.outcome.kind !== "ok") throw new Error("unreachable");
  assert.equal(out.outcome.duplicate, false);
  assert.equal(out.outcome.transactions, 1);
  assert.equal(state.treasury_statements.length, 1);
  assert.equal(state.treasury_transactions.length, 1);
  // raw_hash matches the golden CAMT.053.
  const expectedHash = createHash("sha256").update(goldenCamt053()).digest("hex");
  assert.equal(state.treasury_statements[0]!.raw_hash, expectedHash);
  assert.equal(state.treasury_statements[0]!.source, "ebics_poll");
  // Connection state updated.
  const conn = state.treasury_bank_connections[0]!;
  assert.equal(conn.consecutive_failures, 0);
  assert.equal(conn.breaker_open_until, null);
  assert.equal(conn.last_camt053_statement_date, "2026-05-17");
  // No log line should leak a full IBAN.
  for (const r of records) {
    assert.doesNotMatch(
      r.msg,
      /AT611904300234573201/,
      `account IBAN leaked into log: ${r.msg}`,
    );
    assert.doesNotMatch(
      r.msg,
      /DE89370400440532013000/,
      `counterparty IBAN leaked into log: ${r.msg}`,
    );
  }
  // …but a masked IBAN was emitted at least once for forensics.
  assert.ok(
    records.some((r) => /AT.*\*{6,}.*\d{4}/.test(r.msg)),
    "expected at least one masked-IBAN log line",
  );
}

async function test_pollConnection_dedupe(): Promise<void> {
  const state = newState();
  const row = makeRow();
  state.treasury_bank_connections.push(row);
  const supabase = makeSupabase(state);
  const now = new Date("2026-05-18T08:00:00Z");
  const ctx = {
    supabase,
    auditSupabase: supabase,
    now,
    logger: (() => {}) as Logger,
    clientFactory: makeClientFactory(),
  };
  // First poll inserts the statement.
  const first = await pollConnection(row, ctx);
  assert.equal(first.outcome.kind, "ok");
  assert.equal(state.treasury_statements.length, 1);
  assert.equal(state.treasury_transactions.length, 1);

  // Reset last_camt053_statement_date so the second tick re-attempts, then
  // poll again with the same raw payload — dedupe must kick in.
  state.treasury_bank_connections[0]!.last_camt053_statement_date = null;
  const refreshed = { ...state.treasury_bank_connections[0]! };
  const second = await pollConnection(refreshed, ctx);
  assert.equal(second.outcome.kind, "ok");
  if (second.outcome.kind !== "ok") throw new Error("unreachable");
  assert.equal(second.outcome.duplicate, true);
  assert.equal(second.outcome.transactions, 0);
  assert.equal(state.treasury_statements.length, 1, "no new statement on dedupe");
  assert.equal(state.treasury_transactions.length, 1, "no new transactions on dedupe");
}

async function test_pollConnection_sta_failure_increments_breaker(): Promise<void> {
  const state = newState();
  const row = makeRow();
  state.treasury_bank_connections.push(row);
  const supabase = makeSupabase(state);
  const ctx = {
    supabase,
    auditSupabase: supabase,
    now: new Date("2026-05-18T08:00:00Z"),
    logger: (() => {}) as Logger,
    clientFactory: makeClientFactory({ failSta: new TypeError("ECONNRESET") }),
  };
  const out = await pollConnection(row, ctx);
  assert.equal(out.outcome.kind, "error");
  if (out.outcome.kind !== "error") throw new Error("unreachable");
  assert.equal(out.outcome.breakerOpened, false);
  assert.equal(state.treasury_bank_connections[0]!.consecutive_failures, 1);
  assert.equal(state.treasury_bank_connections[0]!.breaker_open_until, null);
}

async function test_pollConnection_skips_when_breaker_open(): Promise<void> {
  const state = newState();
  const row = makeRow({ breaker_open_until: "2026-05-18T09:00:00Z" });
  state.treasury_bank_connections.push(row);
  const supabase = makeSupabase(state);
  const out = await pollConnection(row, {
    supabase,
    auditSupabase: supabase,
    now: new Date("2026-05-18T08:00:00Z"),
    logger: () => {},
    clientFactory: () => {
      throw new Error("client must not be built when breaker is open");
    },
  });
  assert.equal(out.outcome.kind, "skipped");
  if (out.outcome.kind !== "skipped") throw new Error("unreachable");
  assert.equal(out.outcome.reason, "breaker_open");
  // No statement inserted.
  assert.equal(state.treasury_statements.length, 0);
}

async function test_pollConnection_failure_isolation(): Promise<void> {
  // Two connections — one fails, one succeeds. They MUST NOT see each
  // other's state.
  const state = newState();
  const rowOk = makeRow({ id: "conn-ok", company_id: "co-1" });
  const rowBad = makeRow({
    id: "conn-bad",
    company_id: "co-1",
    ebics_host_id: "BANKDE_PROD",
    bank_bic: "DEUTDEFF",
  });
  state.treasury_bank_connections.push(rowOk, rowBad);
  const supabase = makeSupabase(state);
  const ctx = {
    supabase,
    auditSupabase: supabase,
    now: new Date("2026-05-18T08:00:00Z"),
    logger: (() => {}) as Logger,
  };
  const a = await pollConnection(rowOk, {
    ...ctx,
    clientFactory: makeClientFactory(),
  });
  const b = await pollConnection(rowBad, {
    ...ctx,
    clientFactory: makeClientFactory({ failSta: new TypeError("ECONNRESET") }),
  });
  assert.equal(a.outcome.kind, "ok");
  assert.equal(b.outcome.kind, "error");
  // Healthy connection stays healthy, broken connection bumps counter.
  const ok = state.treasury_bank_connections.find((r) => r.id === "conn-ok")!;
  const bad = state.treasury_bank_connections.find((r) => r.id === "conn-bad")!;
  assert.equal(ok.consecutive_failures, 0);
  assert.equal(bad.consecutive_failures, 1);
  // Statement inserted only for the healthy run.
  assert.equal(state.treasury_statements.length, 1);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const tests: Array<[string, () => Promise<void> | void]> = [
  ["applyFailure_opens_breaker_at_threshold", test_applyFailure_opens_breaker_at_threshold],
  ["applySuccess_resets_state", test_applySuccess_resets_state],
  ["isBreakerOpen_respects_until", test_isBreakerOpen_respects_until],
  ["isoDateInTimezone", test_isoDateInTimezone],
  ["isCamt053Due", test_isCamt053Due],
  ["pollConnection_happy_path", test_pollConnection_happy_path],
  ["pollConnection_dedupe", test_pollConnection_dedupe],
  ["pollConnection_sta_failure_increments_breaker", test_pollConnection_sta_failure_increments_breaker],
  ["pollConnection_skips_when_breaker_open", test_pollConnection_skips_when_breaker_open],
  ["pollConnection_failure_isolation", test_pollConnection_failure_isolation],
];

async function main(): Promise<void> {
  let passed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
      passed += 1;
    } catch (err) {
      console.error(`  FAIL ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }
  console.log(`${passed}/${tests.length} ebics poller tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
