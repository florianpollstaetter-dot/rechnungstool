// ORA-2306 — Unit tests for the EBICS sidecar consumer client.
//
// No test framework: plain `node:assert/strict`. Run with:
//   npx tsx tests/unit/treasury-ebics-sidecar-client.test.ts
//
// Mocks the sidecar REST surface via an injectable `fetch` (no msw — the repo
// has no test framework and msw is not a dev-dependency). Tests cover:
//   - Happy paths for init/hpb/hev/hkd/sta/cct
//   - Audit-chain hash equals sha256(rawBytes || ":" || requestId)
//   - Audit-chain idempotency on requestId (second call → inserted=false)
//   - 502 → EbicsLibraryError, NOT retried
//   - Timeout → EbicsTimeoutError, retried up to maxAttempts
//   - Network error → EbicsNetworkError, retried then surfaced
//   - Invalid response body → EbicsInvalidResponseError
//   - Config loader env precedence

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  EbicsBadRequestError,
  EbicsClientError,
  EbicsInvalidResponseError,
  EbicsLibraryError,
  EbicsNetworkError,
  EbicsSidecarClient,
  EbicsTimeoutError,
  computeRawPayloadHash,
  loadSidecarConfig,
  SidecarConfigError,
  type Logger,
  type LogRecord,
} from "../../src/lib/treasury/ebics";
import type { SidecarConnectionConfig } from "../../src/lib/treasury/ebics/types";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: BodyInit | null | undefined;
}

type FetchResponder = (call: FetchCall, attemptIndex: number) => Promise<Response> | Response;

function makeFetchStub(responder: FetchResponder) {
  const calls: FetchCall[] = [];
  const fn = async (input: string, init: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k] = v;
      }
    }
    const call: FetchCall = {
      url: input,
      method: init.method ?? "GET",
      headers,
      body: init.body,
    };
    calls.push(call);
    return Promise.resolve(responder(call, calls.length - 1));
  };
  return { fn, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Minimal Supabase stub satisfying the audit-chain writer's surface. */
function makeSupabaseStub() {
  const rows: Array<Record<string, unknown>> = [];
  let nextSeq = 1;

  const builder = (table: string) => {
    if (table !== "treasury_audit_chain") {
      throw new Error(`unexpected table ${table}`);
    }

    type Filter = (r: Record<string, unknown>) => boolean;
    const filters: Filter[] = [];
    let mode: "select" | "insert" = "select";
    let pending: Record<string, unknown> | null = null;

    const api = {
      select(_cols: string) {
        return api;
      },
      eq(field: string, value: unknown) {
        filters.push((r) => r[field] === value);
        return api;
      },
      filter(field: string, op: string, value: unknown) {
        if (op !== "eq") throw new Error(`unsupported op ${op}`);
        if (field === "payload->>request_id") {
          filters.push((r) => {
            const payload = r["payload"] as Record<string, unknown> | undefined;
            return payload != null && payload["request_id"] === value;
          });
        } else {
          filters.push((r) => r[field] === value);
        }
        return api;
      },
      async maybeSingle() {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        return { data: matched[0] ?? null, error: null as null };
      },
      insert(row: Record<string, unknown>) {
        mode = "insert";
        pending = { ...row, seq: nextSeq++ };
        return api;
      },
      async single() {
        if (mode !== "insert" || !pending) {
          throw new Error("single() called without insert");
        }
        rows.push(pending);
        const out = pending;
        pending = null;
        return { data: out, error: null as null };
      },
    };
    return api;
  };

  return {
    client: { from: builder } as unknown as SupabaseClient,
    rows,
  };
}

function makeConfig(overrides: Partial<SidecarConnectionConfig> = {}): SidecarConnectionConfig {
  return {
    hostId: "TESTBANK",
    baseUrl: "https://sidecar.test",
    bearerToken: "tkn-abc",
    timeoutMs: 2_000,
    maxAttempts: 3,
    baseBackoffMs: 1,
    ...overrides,
  };
}

function collectingLogger(): { log: Logger; records: LogRecord[] } {
  const records: LogRecord[] = [];
  return { log: (r) => records.push(r), records };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function test_config_loader_env_precedence(): Promise<void> {
  // Per-host override beats the global default.
  const cfg = loadSidecarConfig("EBIXBANK-PROD", {
    env: {
      EBICS_SIDECAR_BASE_URL: "https://global.test",
      EBICS_SIDECAR_BEARER_TOKEN: "global-token",
      EBICS_SIDECAR_BASE_URL__EBIXBANK_PROD: "https://specific.test/",
      EBICS_SIDECAR_BEARER_TOKEN__EBIXBANK_PROD: "specific-token",
    },
  });
  assert.equal(cfg.baseUrl, "https://specific.test");
  assert.equal(cfg.bearerToken, "specific-token");
  assert.equal(cfg.timeoutMs, 30_000);
  assert.equal(cfg.maxAttempts, 3);

  // Falls back to global default if no per-host override is set.
  const fallback = loadSidecarConfig("OTHER", {
    env: {
      EBICS_SIDECAR_BASE_URL: "https://global.test/",
      EBICS_SIDECAR_BEARER_TOKEN: "global-token",
    },
  });
  assert.equal(fallback.baseUrl, "https://global.test");
  assert.equal(fallback.bearerToken, "global-token");

  // Missing baseUrl → SidecarConfigError.
  assert.throws(() => loadSidecarConfig("X", { env: {} }), SidecarConfigError);

  // Empty hostId → SidecarConfigError.
  assert.throws(() => loadSidecarConfig("", { env: {} }), SidecarConfigError);
}

async function test_happy_path_sta_with_audit_chain(): Promise<void> {
  const rawBase64 = Buffer.from("<Document>camt</Document>", "utf8").toString("base64");
  const { fn, calls } = makeFetchStub(() =>
    jsonResponse(200, {
      requestId: "req-sta-1",
      rawBase64,
      rawBytes: Buffer.from(rawBase64, "base64").length,
      from: "2026-05-01",
      to: "2026-05-15",
    }),
  );
  const { client: supabase, rows } = makeSupabaseStub();
  const { log, records } = collectingLogger();
  const client = new EbicsSidecarClient({
    config: makeConfig(),
    supabase,
    fetchFn: fn,
    logger: log,
    random: () => 0,
  });

  const { result, audit } = await client.sta(
    { from: "2026-05-01", to: "2026-05-15" },
    { companyId: "co-1", actorUserId: "user-1" },
  );

  assert.equal(result.requestId, "req-sta-1");
  assert.equal(result.from, "2026-05-01");
  assert.equal(result.to, "2026-05-15");
  assert.equal(result.rawBytes, Buffer.from(rawBase64, "base64").length);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "GET");
  assert.equal(calls[0]!.url, "https://sidecar.test/ebics/sta?from=2026-05-01&to=2026-05-15");
  assert.equal(calls[0]!.headers["Authorization"], "Bearer tkn-abc");

  // Audit chain: hash equals sha256(decoded raw bytes || ":" || requestId).
  const expectedHash = createHash("sha256")
    .update(Buffer.from(rawBase64, "base64"))
    .update(":")
    .update("req-sta-1")
    .digest("hex");
  assert.equal(audit.inserted, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!["event_type"], "ebics.sta");
  assert.equal(rows[0]!["company_id"], "co-1");
  assert.equal((rows[0]!["payload"] as Record<string, unknown>).payload_hash, expectedHash);
  assert.equal((rows[0]!["payload"] as Record<string, unknown>).request_id, "req-sta-1");
  assert.equal((rows[0]!["payload"] as Record<string, unknown>).host_id, "TESTBANK");
  assert.equal((rows[0]!["payload"] as Record<string, unknown>).raw_bytes, result.rawBytes);

  // computeRawPayloadHash export agrees with internal computation.
  assert.equal(computeRawPayloadHash(rawBase64, "req-sta-1"), expectedHash);

  // Structured log includes requestId correlation.
  assert.ok(records.some((r) => r.requestId === "req-sta-1" && r.op === "sta" && r.msg === "ebics.sidecar.ok"));
}

async function test_happy_path_init_uses_json_hash(): Promise<void> {
  const { fn } = makeFetchStub(() =>
    jsonResponse(200, {
      requestId: "req-init-1",
      iniOrderId: "INI-001",
      hiaOrderId: "HIA-001",
    }),
  );
  const { client: supabase, rows } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig(),
    supabase,
    fetchFn: fn,
    random: () => 0,
  });

  const { result, audit } = await client.init({ companyId: "co-1", actorUserId: null });
  assert.equal(result.iniOrderId, "INI-001");
  assert.equal(result.hiaOrderId, "HIA-001");
  assert.equal(audit.inserted, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!["event_type"], "ebics.init");
  assert.equal(rows[0]!["actor_user_id"], null);
  const payload = rows[0]!["payload"] as Record<string, unknown>;
  assert.equal(payload.ini_order_id, "INI-001");
  assert.equal(payload.hia_order_id, "HIA-001");
}

async function test_happy_path_hpb_hev_hkd(): Promise<void> {
  const rawBase64 = Buffer.from("pubkey-bytes", "utf8").toString("base64");
  let counter = 0;
  const { fn } = makeFetchStub(() => {
    counter += 1;
    const body =
      counter === 1
        ? { requestId: `req-${counter}`, rawBase64, rawBytes: 12 }
        : counter === 2
          ? { requestId: `req-${counter}`, rawBase64, rawBytes: 12, supportedVersion: "H005" }
          : { requestId: `req-${counter}`, rawBase64, rawBytes: 12 };
    return jsonResponse(200, body);
  });
  const { client: supabase, rows } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig(),
    supabase,
    fetchFn: fn,
    random: () => 0,
  });

  const hpb = await client.hpb({ companyId: "co-1", actorUserId: "u" });
  const hev = await client.hev({ companyId: "co-1", actorUserId: "u" });
  const hkd = await client.hkd({ companyId: "co-1", actorUserId: "u" });

  assert.equal(hpb.result.requestId, "req-1");
  assert.equal(hev.result.requestId, "req-2");
  assert.equal(hev.result.supportedVersion, "H005");
  assert.equal(hkd.result.requestId, "req-3");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r["event_type"]).sort(), ["ebics.hev", "ebics.hkd", "ebics.hpb"]);
}

async function test_happy_path_cct(): Promise<void> {
  const { fn, calls } = makeFetchStub(() =>
    jsonResponse(200, {
      requestId: "req-cct-1",
      bankOrderId: "ORD-1",
      payloadBytes: 1024,
    }),
  );
  const { client: supabase, rows } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig(),
    supabase,
    fetchFn: fn,
    random: () => 0,
  });

  const pain001 = "<Document><CstmrCdtTrfInitn/></Document>";
  const out = await client.cct({ pain001 }, { companyId: "co-1", actorUserId: "u" });
  assert.equal(out.result.bankOrderId, "ORD-1");
  assert.equal(out.audit.inserted, true);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.headers["Content-Type"], "application/xml");
  assert.equal(calls[0]!.body, pain001);
  assert.equal((rows[0]!["payload"] as Record<string, unknown>).bank_order_id, "ORD-1");
}

async function test_cct_empty_body_rejected(): Promise<void> {
  const { fn } = makeFetchStub(() => jsonResponse(200, {}));
  const { client: supabase } = makeSupabaseStub();
  const client = new EbicsSidecarClient({ config: makeConfig(), supabase, fetchFn: fn, random: () => 0 });
  await assert.rejects(
    () => client.cct({ pain001: "" }, { companyId: "co-1", actorUserId: null }),
    /pain\.001 body is empty/,
  );
}

async function test_sta_validates_date(): Promise<void> {
  const { fn } = makeFetchStub(() => jsonResponse(200, {}));
  const { client: supabase } = makeSupabaseStub();
  const client = new EbicsSidecarClient({ config: makeConfig(), supabase, fetchFn: fn, random: () => 0 });
  await assert.rejects(
    () => client.sta({ from: "2026/05/01" }, { companyId: "co-1", actorUserId: null }),
    /ISO date/,
  );
}

async function test_502_maps_to_library_error_and_not_retried(): Promise<void> {
  let calls = 0;
  const { fn } = makeFetchStub(() => {
    calls += 1;
    return jsonResponse(502, { error: "ebics-failure", op: "sta", message: "bank rejected" });
  });
  const { client: supabase } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig({ maxAttempts: 3, baseBackoffMs: 0 }),
    supabase,
    fetchFn: fn,
    sleep: async () => {},
    random: () => 0,
  });

  await assert.rejects(
    () => client.sta({ from: "2026-05-01" }, { companyId: "co-1", actorUserId: null }),
    (err: unknown) => {
      assert.ok(err instanceof EbicsLibraryError, `expected EbicsLibraryError, got ${(err as Error)?.constructor?.name}`);
      assert.equal((err as EbicsLibraryError).httpStatus, 502);
      assert.equal((err as EbicsLibraryError).sidecarError, "ebics-failure");
      assert.equal((err as EbicsLibraryError).message, "bank rejected");
      assert.equal((err as EbicsLibraryError).op, "sta");
      return true;
    },
  );
  // Library errors are NOT retried — single attempt only.
  assert.equal(calls, 1);
}

async function test_400_maps_to_bad_request_error(): Promise<void> {
  const { fn } = makeFetchStub(() => jsonResponse(400, { error: "empty-payload" }));
  const { client: supabase } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig({ maxAttempts: 1, baseBackoffMs: 0 }),
    supabase,
    fetchFn: fn,
    sleep: async () => {},
    random: () => 0,
  });
  await assert.rejects(
    () =>
      client.cct({ pain001: "x" }, { companyId: "co-1", actorUserId: null }),
    EbicsBadRequestError,
  );
}

async function test_timeout_retried_then_succeeds(): Promise<void> {
  let attempt = 0;
  // First two attempts simulate an aborted fetch; the third succeeds.
  const { fn } = makeFetchStub((_call) => {
    attempt += 1;
    if (attempt < 3) {
      const e = new Error("aborted");
      (e as Error & { name: string }).name = "AbortError";
      return Promise.reject(e);
    }
    return jsonResponse(200, {
      requestId: "req-late",
      rawBase64: Buffer.from("ok", "utf8").toString("base64"),
      rawBytes: 2,
    });
  });
  const { client: supabase, rows } = makeSupabaseStub();
  const sleeps: number[] = [];
  const client = new EbicsSidecarClient({
    config: makeConfig({ maxAttempts: 3, baseBackoffMs: 10 }),
    supabase,
    fetchFn: fn,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
  });
  const out = await client.hpb({ companyId: "co-1", actorUserId: null });
  assert.equal(out.result.requestId, "req-late");
  assert.equal(attempt, 3);
  assert.equal(sleeps.length, 2);
  // exponential base: 10, 20 with random=0 → no jitter.
  assert.equal(sleeps[0], 10);
  assert.equal(sleeps[1], 20);
  assert.equal(rows.length, 1);
}

async function test_timeout_exhausted_surfaces_timeout_error(): Promise<void> {
  const { fn } = makeFetchStub(() => {
    const e = new Error("aborted");
    (e as Error & { name: string }).name = "AbortError";
    return Promise.reject(e);
  });
  const { client: supabase } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig({ maxAttempts: 2, baseBackoffMs: 0 }),
    supabase,
    fetchFn: fn,
    sleep: async () => {},
    random: () => 0,
  });
  await assert.rejects(
    () => client.hev({ companyId: "co-1", actorUserId: null }),
    (err: unknown) => {
      assert.ok(err instanceof EbicsTimeoutError);
      assert.equal((err as EbicsTimeoutError).timeoutMs, 2_000);
      return true;
    },
  );
}

async function test_network_error_retries_then_surfaces(): Promise<void> {
  let attempt = 0;
  const { fn } = makeFetchStub(() => {
    attempt += 1;
    return Promise.reject(new TypeError("fetch failed: ECONNRESET"));
  });
  const { client: supabase } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig({ maxAttempts: 3, baseBackoffMs: 0 }),
    supabase,
    fetchFn: fn,
    sleep: async () => {},
    random: () => 0,
  });
  await assert.rejects(
    () => client.hkd({ companyId: "co-1", actorUserId: null }),
    (err: unknown) => {
      assert.ok(err instanceof EbicsNetworkError);
      assert.equal((err as EbicsClientError).attempt, 3);
      return true;
    },
  );
  assert.equal(attempt, 3);
}

async function test_audit_chain_idempotent_on_request_id(): Promise<void> {
  const rawBase64 = Buffer.from("dup", "utf8").toString("base64");
  const { fn } = makeFetchStub(() =>
    jsonResponse(200, {
      requestId: "req-dup",
      rawBase64,
      rawBytes: 3,
      from: "2026-05-01",
      to: "2026-05-01",
    }),
  );
  const { client: supabase, rows } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig(),
    supabase,
    fetchFn: fn,
    random: () => 0,
  });

  const a = await client.sta({ from: "2026-05-01" }, { companyId: "co-1", actorUserId: null });
  const b = await client.sta({ from: "2026-05-01" }, { companyId: "co-1", actorUserId: null });
  assert.equal(a.audit.inserted, true);
  assert.equal(b.audit.inserted, false);
  assert.equal(b.audit.seq, a.audit.seq);
  // Only one row in the chain despite two sidecar calls with the same requestId.
  assert.equal(rows.length, 1);
}

async function test_invalid_response_body(): Promise<void> {
  const { fn } = makeFetchStub(() =>
    new Response("not-json", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    }),
  );
  const { client: supabase } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig({ maxAttempts: 1, baseBackoffMs: 0 }),
    supabase,
    fetchFn: fn,
    sleep: async () => {},
    random: () => 0,
  });
  await assert.rejects(
    () => client.hpb({ companyId: "co-1", actorUserId: null }),
    EbicsInvalidResponseError,
  );
}

async function test_invalid_response_shape(): Promise<void> {
  const { fn } = makeFetchStub(() => jsonResponse(200, { requestId: "x" }));
  const { client: supabase } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig({ maxAttempts: 1, baseBackoffMs: 0 }),
    supabase,
    fetchFn: fn,
    sleep: async () => {},
    random: () => 0,
  });
  await assert.rejects(
    () => client.hpb({ companyId: "co-1", actorUserId: null }),
    EbicsInvalidResponseError,
  );
}

async function test_no_bearer_header_when_token_missing(): Promise<void> {
  const { fn, calls } = makeFetchStub(() =>
    jsonResponse(200, {
      requestId: "req-noauth",
      rawBase64: Buffer.from("x").toString("base64"),
      rawBytes: 1,
    }),
  );
  const { client: supabase } = makeSupabaseStub();
  const client = new EbicsSidecarClient({
    config: makeConfig({ bearerToken: undefined }),
    supabase,
    fetchFn: fn,
    random: () => 0,
  });
  await client.hpb({ companyId: "co-1", actorUserId: null });
  assert.equal(calls[0]!.headers["Authorization"], undefined);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const tests: Array<[string, () => Promise<void>]> = [
    ["config_loader_env_precedence", test_config_loader_env_precedence],
    ["happy_path_sta_with_audit_chain", test_happy_path_sta_with_audit_chain],
    ["happy_path_init_uses_json_hash", test_happy_path_init_uses_json_hash],
    ["happy_path_hpb_hev_hkd", test_happy_path_hpb_hev_hkd],
    ["happy_path_cct", test_happy_path_cct],
    ["cct_empty_body_rejected", test_cct_empty_body_rejected],
    ["sta_validates_date", test_sta_validates_date],
    ["502_maps_to_library_error_and_not_retried", test_502_maps_to_library_error_and_not_retried],
    ["400_maps_to_bad_request_error", test_400_maps_to_bad_request_error],
    ["timeout_retried_then_succeeds", test_timeout_retried_then_succeeds],
    ["timeout_exhausted_surfaces_timeout_error", test_timeout_exhausted_surfaces_timeout_error],
    ["network_error_retries_then_surfaces", test_network_error_retries_then_surfaces],
    ["audit_chain_idempotent_on_request_id", test_audit_chain_idempotent_on_request_id],
    ["invalid_response_body", test_invalid_response_body],
    ["invalid_response_shape", test_invalid_response_shape],
    ["no_bearer_header_when_token_missing", test_no_bearer_header_when_token_missing],
  ];

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
  console.log(`${passed}/${tests.length} ebics sidecar client tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
