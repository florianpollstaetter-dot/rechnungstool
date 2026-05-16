// ORA-2282 — Smoke test for the Treasury skill tools.
//
// Verifies the three acceptance-critical tools:
//   * get_cash_position   — joins bank_accounts + latest statement per acct
//   * propose_payment     — inserts a draft run + payment, returns approval URL
//   * generate_boardpack  — validates entity + period, returns queued job id
//
// Self-contained — no test framework, just `node:assert/strict`. Run with:
//   npx tsx tests/unit/treasury-skill-tools.test.ts
//
// The Supabase client is a hand-rolled stub that mimics the
// `supabase-js` query builder closely enough for these handlers
// (`from().select().eq()...maybeSingle/insert`). It is intentionally
// minimal — the assertions below show exactly which calls are exercised.

import assert from "node:assert/strict";
import {
  runTreasuryTool,
  treasuryTools,
  buildAnthropicToolDefinitions,
  type SkillContext,
} from "../../src/lib/treasury/skill-tools";

// ---------------------------------------------------------------------------
// Supabase stub
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface InsertRecord {
  table: string;
  row: Row;
}

class QueryBuilder {
  private rows: Row[];
  private inserts: Row[] = [];
  private mode: "select" | "insert" = "select";
  private orderField: string | null = null;
  private orderAsc = true;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private limitN: number | null = null;
  private filters: Array<(r: Row) => boolean> = [];

  constructor(
    private store: Store,
    private table: string,
  ) {
    this.rows = store.tables[table] ?? [];
  }

  select(_cols: string, _opts?: unknown): this {
    this.mode = "select";
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.mode = "insert";
    const arr = Array.isArray(payload) ? payload : [payload];
    for (const row of arr) {
      const withId = { id: row.id ?? this.store.nextId(), ...row };
      this.inserts.push(withId);
      this.store.tables[this.table] ??= [];
      this.store.tables[this.table].push(withId);
      this.store.inserts.push({ table: this.table, row: withId });
    }
    return this;
  }
  eq(field: string, value: unknown): this {
    this.filters.push((r) => r[field] === value);
    return this;
  }
  in(field: string, values: unknown[]): this {
    const set = new Set(values);
    this.filters.push((r) => set.has(r[field]));
    return this;
  }
  ilike(field: string, _pattern: string): this {
    this.filters.push((r) => typeof r[field] === "string");
    return this;
  }
  gte(field: string, value: unknown): this {
    this.filters.push((r) => (r[field] as number | string) >= (value as number | string));
    return this;
  }
  lte(field: string, value: unknown): this {
    this.filters.push((r) => (r[field] as number | string) <= (value as number | string));
    return this;
  }
  order(field: string, opts?: { ascending?: boolean }): this {
    this.orderField = field;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  private currentRows(): Row[] {
    if (this.mode === "insert") return this.inserts;
    let rows = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderField) {
      const field = this.orderField;
      rows = rows.slice().sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        const cmp = av == null ? -1 : bv == null ? 1 : av > bv ? 1 : av < bv ? -1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.rangeFrom != null && this.rangeTo != null) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  async maybeSingle<T = Row>(): Promise<{ data: T | null; error: null }> {
    return { data: (this.currentRows()[0] as T | undefined) ?? null, error: null };
  }
  async single<T = Row>(): Promise<{ data: T | null; error: null }> {
    return { data: (this.currentRows()[0] as T | undefined) ?? null, error: null };
  }
  // Default await: returns the multi-row result. Supabase resolves a builder
  // directly when awaited without `.maybeSingle()` — emulate via .then.
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const rows = this.currentRows();
    const result = { data: rows, error: null as null, count: rows.length };
    return Promise.resolve(onfulfilled ? onfulfilled(result) : (result as unknown as TResult1));
  }
}

interface Store {
  tables: Record<string, Row[]>;
  inserts: InsertRecord[];
  nextId: () => string;
}

function buildStore(seed: Record<string, Row[]>): Store {
  let n = 0;
  return {
    tables: structuredClone(seed),
    inserts: [],
    nextId: () => `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`,
  };
}

function makeClient(store: Store): SkillContext["supabase"] {
  return {
    from(table: string) {
      return new QueryBuilder(store, table);
    },
  } as unknown as SkillContext["supabase"];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error(`  FAIL  ${name}\n        ${msg}`);
  }
}

const COMPANY = "co_abc";
// Zod v4 UUIDs require a valid version nibble (1–8). Hand-rolled v4 strings.
const ENTITY = "a1b2c3d4-1111-4abc-9def-111111111111";
const ACCOUNT = "b2c3d4e5-2222-4abc-9def-222222222222";
const ACCOUNT2 = "c3d4e5f6-3333-4abc-9def-333333333333";
const USER = "d4e5f6a7-4444-4abc-9def-444444444444";

function ctxWith(store: Store): SkillContext {
  return {
    supabase: makeClient(store),
    companyId: COMPANY,
    userId: USER,
    locale: "de",
  };
}

async function main() {
await test("registry exposes the documented tool surface", () => {
  const names = treasuryTools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "generate_boardpack",
    "get_cash_forecast",
    "get_cash_position",
    "list_bank_accounts",
    "list_payment_runs",
    "list_sanctions_hits",
    "propose_mmf_allocation",
    "propose_payment",
    "query_transactions",
  ]);
});

await test("buildAnthropicToolDefinitions emits JSON Schema with cache_control on tail", () => {
  const defs = buildAnthropicToolDefinitions();
  assert.equal(defs.length, treasuryTools.length);
  for (const d of defs) {
    assert.equal(typeof d.name, "string");
    assert.equal(typeof d.description, "string");
    assert.equal(typeof d.input_schema, "object");
    assert.ok((d.input_schema as Record<string, unknown>).type === "object");
  }
  assert.deepEqual(defs[defs.length - 1].cache_control, { type: "ephemeral" });
  // Other tools must not carry cache_control (only the tail).
  for (const d of defs.slice(0, -1)) {
    assert.equal(d.cache_control, undefined);
  }
});

await test("get_cash_position returns balances and aggregates per currency", async () => {
  const store = buildStore({
    treasury_bank_accounts: [
      {
        id: ACCOUNT,
        entity_id: ENTITY,
        iban: "DE89370400440532013000",
        bank_name: "Erste",
        bank_bic: "GIBAATWWXXX",
        currency: "EUR",
        status: "active",
      },
      {
        id: ACCOUNT2,
        entity_id: ENTITY,
        iban: "AT611904300234573201",
        bank_name: "Raiffeisen",
        bank_bic: "RZBAATWWXXX",
        currency: "EUR",
        status: "active",
      },
    ],
    treasury_statements: [
      {
        id: "s1",
        account_id: ACCOUNT,
        statement_date: "2026-05-01",
        closing_balance: 12500.5,
        currency: "EUR",
      },
      {
        id: "s2",
        account_id: ACCOUNT,
        statement_date: "2026-05-10",
        closing_balance: 14000.0,
        currency: "EUR",
      },
      {
        id: "s3",
        account_id: ACCOUNT2,
        statement_date: "2026-05-10",
        closing_balance: 3000.0,
        currency: "EUR",
      },
    ],
  });

  const res = await runTreasuryTool("get_cash_position", { entity_id: ENTITY }, ctxWith(store));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const data = res.data as {
    accounts: Array<{ account_id: string; balance: number; statement_date: string | null }>;
    totals: Record<string, number>;
  };
  assert.equal(data.accounts.length, 2);
  const erste = data.accounts.find((a) => a.account_id === ACCOUNT)!;
  assert.equal(erste.balance, 14000);
  assert.equal(erste.statement_date, "2026-05-10");
  assert.equal(data.totals.EUR, 17000);
});

await test("get_cash_position with no statements returns 0 balances, never undefined", async () => {
  const store = buildStore({
    treasury_bank_accounts: [
      {
        id: ACCOUNT,
        entity_id: ENTITY,
        iban: "DE12500105170648489890",
        bank_name: "DKB",
        bank_bic: "BYLADEM1001",
        currency: "EUR",
        status: "active",
      },
    ],
    treasury_statements: [],
  });
  const res = await runTreasuryTool("get_cash_position", {}, ctxWith(store));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const data = res.data as { accounts: Array<{ balance: number }>; totals: Record<string, number> };
  assert.equal(data.accounts[0].balance, 0);
  assert.equal(data.totals.EUR, 0);
});

await test("propose_payment writes a draft run + payment row and returns approval URL", async () => {
  const store = buildStore({
    treasury_bank_accounts: [
      {
        id: ACCOUNT,
        entity_id: ENTITY,
        currency: "EUR",
        status: "active",
      },
    ],
    treasury_payment_runs: [],
    treasury_payments: [],
  });
  const res = await runTreasuryTool(
    "propose_payment",
    {
      account_id: ACCOUNT,
      beneficiary: { name: "ACME GmbH", iban: "DE89370400440532013000" },
      amount: 50000,
      currency: "EUR",
      scheme: "SEPA-CT",
      remittance_info: "Rechnung 2026-042",
    },
    ctxWith(store),
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const data = res.data as {
    payment_run_draft_id: string;
    status: string;
    approval_url: string;
    end_to_end_id: string;
  };
  assert.equal(data.status, "draft");
  assert.match(data.approval_url, /^\/treasury\/payments\//);
  assert.match(data.end_to_end_id, /^SKILL-/);

  const inserts = store.inserts.map((i) => i.table);
  assert.ok(inserts.includes("treasury_payment_runs"), "run insert");
  assert.ok(inserts.includes("treasury_payments"), "payment insert");

  const run = store.inserts.find((i) => i.table === "treasury_payment_runs")!.row;
  assert.equal(run.status, "draft", "run starts as draft — NEVER auto-execute");
  assert.equal(run.company_id, COMPANY);
  assert.equal(run.initiator_user_id, USER);
  assert.equal(run.total_amount, 50000);

  const payment = store.inserts.find((i) => i.table === "treasury_payments")!.row;
  assert.equal(payment.beneficiary_iban, "DE89370400440532013000");
  assert.equal(payment.amount, 50000);
});

await test("propose_payment rejects currency mismatch", async () => {
  const store = buildStore({
    treasury_bank_accounts: [
      { id: ACCOUNT, entity_id: ENTITY, currency: "EUR", status: "active" },
    ],
  });
  const res = await runTreasuryTool(
    "propose_payment",
    {
      account_id: ACCOUNT,
      beneficiary: { name: "ACME", iban: "GB29NWBK60161331926819" },
      amount: 100,
      currency: "USD",
      scheme: "SEPA-CT",
    },
    ctxWith(store),
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.error, /Currency mismatch/);
});

await test("propose_payment rejects invalid IBAN at the Zod boundary", async () => {
  const store = buildStore({
    treasury_bank_accounts: [
      { id: ACCOUNT, entity_id: ENTITY, currency: "EUR", status: "active" },
    ],
  });
  const res = await runTreasuryTool(
    "propose_payment",
    {
      account_id: ACCOUNT,
      beneficiary: { name: "ACME", iban: "not-an-iban" },
      amount: 100,
      currency: "EUR",
      scheme: "SEPA-CT",
    },
    ctxWith(store),
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.error, /Invalid input for propose_payment/);
});

await test("generate_boardpack queues a job and returns expected URL", async () => {
  const store = buildStore({
    treasury_entities: [{ id: ENTITY, legal_name: "Octo Holding GmbH", currency: "EUR" }],
  });
  const res = await runTreasuryTool(
    "generate_boardpack",
    {
      entity_id: ENTITY,
      period_start: "2026-01-01",
      period_end: "2026-03-31",
      language: "de",
    },
    ctxWith(store),
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const data = res.data as { status: string; job_id: string; expected_url: string; language: string };
  assert.equal(data.status, "queued");
  assert.equal(data.language, "de");
  assert.match(data.job_id, /^boardpack-/);
  assert.match(data.expected_url, /\/api\/treasury\/boardpack\//);
});

await test("generate_boardpack rejects inverted period", async () => {
  const store = buildStore({
    treasury_entities: [{ id: ENTITY, legal_name: "Octo", currency: "EUR" }],
  });
  const res = await runTreasuryTool(
    "generate_boardpack",
    {
      entity_id: ENTITY,
      period_start: "2026-03-31",
      period_end: "2026-01-01",
    },
    ctxWith(store),
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.error, /period_start must be on or before/);
});

await test("unknown tool returns a structured error", async () => {
  const store = buildStore({});
  const res = await runTreasuryTool("get_market_data", {}, ctxWith(store));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.error, /Unknown tool/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
