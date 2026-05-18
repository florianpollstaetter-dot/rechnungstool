// ORA-2306 — Next.js consumer for the EBICS Spring-Boot sidecar (ORA-2297).
//
// REST surface mirrored from `EbicsController` in
// `treasury-poc/services/ebics-sidecar-java/src/main/java/com/orangeocto/ebics/EbicsController.java`:
//   - POST /ebics/init        → InitResult
//   - GET  /ebics/hpb         → HpbResult  (rawBase64 = bank pubkey bundle)
//   - GET  /ebics/hev         → HevResult  (rawBase64 + supportedVersion)
//   - GET  /ebics/hkd         → HkdResult  (rawBase64 = subscriber state)
//   - GET  /ebics/sta?from=…  → StaResult  (rawBase64 = CAMT.053 bytes)
//   - POST /ebics/cct  (XML)  → CctResult  (bankOrderId)
//
// Operational guarantees:
//   - Per-call timeout via AbortController.
//   - Exponential-backoff retry with jitter on transient (network/timeout/5xx)
//     failures; library 502s are NOT retried (they indicate the bank rejected
//     the request — re-issuing won't change that).
//   - Single-writer audit-chain write per call, idempotent on requestId.
//   - Structured logging hook: every attempt + outcome emits a record carrying
//     `requestId`, `op`, `hostId`, and `attempt` for correlation with sidecar
//     logs.
//
// Decoupling: this module only depends on `@supabase/supabase-js` (peer of the
// rest of the app), `node:crypto`, and the global `fetch`. No imports from
// `src/lib/invoices/*`.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  writeEbicsAuditChainEntry,
  computeJsonPayloadHash,
  computeRawPayloadHash,
  type AuditChainWriteResult,
} from "./audit-chain";
import {
  EbicsBadRequestError,
  EbicsClientError,
  EbicsInvalidResponseError,
  EbicsLibraryError,
  EbicsNetworkError,
  EbicsTimeoutError,
  EbicsUnexpectedStatusError,
  isRetryableError,
} from "./errors";
import type {
  EbicsCctResult,
  EbicsHevResult,
  EbicsHkdResult,
  EbicsHpbResult,
  EbicsInitResult,
  EbicsOp,
  EbicsRawPayloadResponse,
  EbicsSidecarErrorBody,
  EbicsStaResult,
  SidecarConnectionConfig,
} from "./types";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type Sleep = (ms: number) => Promise<void>;

type Random = () => number;

export interface LogRecord {
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  op: EbicsOp;
  hostId: string;
  requestId: string | null;
  attempt: number;
  durationMs?: number;
  httpStatus?: number | null;
  errorCode?: string;
}

export type Logger = (record: LogRecord) => void;

const NOOP_LOGGER: Logger = () => {};

export interface ClientCallContext {
  /** company_id used for the audit-chain row. */
  companyId: string;
  /** auth.users id of the human operator (null for cron / system runs). */
  actorUserId: string | null;
}

export interface EbicsSidecarClientOptions {
  config: SidecarConnectionConfig;
  supabase: SupabaseClient;
  /** Optional fetch injection — primarily for tests. Defaults to `globalThis.fetch`. */
  fetchFn?: FetchLike;
  /** Optional sleep injection (for deterministic retry tests). */
  sleep?: Sleep;
  /** Optional random injection (for deterministic jitter tests). */
  random?: Random;
  /** Optional structured-log sink. Defaults to no-op. */
  logger?: Logger;
}

interface InvokeArgs<T> {
  op: EbicsOp;
  method: "GET" | "POST";
  path: string;
  contentType?: string;
  body?: BodyInit;
  /** Parse + validate the response body. */
  parse: (raw: unknown) => T;
  ctx: ClientCallContext;
  /** Hashable view for audit chain. Either rawBase64 hash or JSON hash. */
  hashOf: (parsed: T) => { kind: "raw"; rawBase64: string; rawBytes: number } | { kind: "json"; payload: unknown };
  extra?: (parsed: T) => Record<string, unknown>;
}

export interface EbicsCallResult<T> {
  /** Parsed, typed sidecar response. */
  result: T;
  /** Outcome of the audit-chain write for this call. */
  audit: AuditChainWriteResult;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string") {
    throw new Error(`Expected string at "${key}"`);
  }
  return v;
}

function requireNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Expected number at "${key}"`);
  }
  return v;
}

function parseRawPayload(raw: unknown): EbicsRawPayloadResponse {
  if (!isPlainObject(raw)) throw new Error("Body is not an object");
  return {
    requestId: requireString(raw, "requestId"),
    rawBase64: requireString(raw, "rawBase64"),
    rawBytes: requireNumber(raw, "rawBytes"),
  };
}

export class EbicsSidecarClient {
  readonly config: SidecarConnectionConfig;
  private readonly supabase: SupabaseClient;
  private readonly fetchFn: FetchLike;
  private readonly sleep: Sleep;
  private readonly random: Random;
  private readonly logger: Logger;

  constructor(opts: EbicsSidecarClientOptions) {
    this.config = opts.config;
    this.supabase = opts.supabase;
    this.fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? defaultSleep;
    this.random = opts.random ?? Math.random;
    this.logger = opts.logger ?? NOOP_LOGGER;
  }

  // -------------------------------------------------------------------------
  // Public API — one method per EbicsController endpoint.
  // -------------------------------------------------------------------------

  async init(ctx: ClientCallContext): Promise<EbicsCallResult<EbicsInitResult>> {
    return this.invoke<EbicsInitResult>({
      op: "init",
      method: "POST",
      path: "/ebics/init",
      ctx,
      parse: (raw) => {
        if (!isPlainObject(raw)) throw new Error("Body is not an object");
        return {
          requestId: requireString(raw, "requestId"),
          iniOrderId: requireString(raw, "iniOrderId"),
          hiaOrderId: requireString(raw, "hiaOrderId"),
        };
      },
      hashOf: (parsed) => ({
        kind: "json",
        payload: { iniOrderId: parsed.iniOrderId, hiaOrderId: parsed.hiaOrderId },
      }),
      extra: (parsed) => ({
        ini_order_id: parsed.iniOrderId,
        hia_order_id: parsed.hiaOrderId,
      }),
    });
  }

  async hpb(ctx: ClientCallContext): Promise<EbicsCallResult<EbicsHpbResult>> {
    return this.invoke<EbicsHpbResult>({
      op: "hpb",
      method: "GET",
      path: "/ebics/hpb",
      ctx,
      parse: parseRawPayload,
      hashOf: (parsed) => ({ kind: "raw", rawBase64: parsed.rawBase64, rawBytes: parsed.rawBytes }),
    });
  }

  async hev(ctx: ClientCallContext): Promise<EbicsCallResult<EbicsHevResult>> {
    return this.invoke<EbicsHevResult>({
      op: "hev",
      method: "GET",
      path: "/ebics/hev",
      ctx,
      parse: (raw) => {
        const base = parseRawPayload(raw);
        const obj = raw as Record<string, unknown>;
        return { ...base, supportedVersion: requireString(obj, "supportedVersion") };
      },
      hashOf: (parsed) => ({ kind: "raw", rawBase64: parsed.rawBase64, rawBytes: parsed.rawBytes }),
      extra: (parsed) => ({ supported_version: parsed.supportedVersion }),
    });
  }

  async hkd(ctx: ClientCallContext): Promise<EbicsCallResult<EbicsHkdResult>> {
    return this.invoke<EbicsHkdResult>({
      op: "hkd",
      method: "GET",
      path: "/ebics/hkd",
      ctx,
      parse: parseRawPayload,
      hashOf: (parsed) => ({ kind: "raw", rawBase64: parsed.rawBase64, rawBytes: parsed.rawBytes }),
    });
  }

  async sta(
    args: { from: string; to?: string },
    ctx: ClientCallContext,
  ): Promise<EbicsCallResult<EbicsStaResult>> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.from)) {
      throw new Error('sta: "from" must be ISO date (YYYY-MM-DD)');
    }
    if (args.to !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(args.to)) {
      throw new Error('sta: "to" must be ISO date (YYYY-MM-DD)');
    }
    const query = new URLSearchParams({ from: args.from });
    if (args.to) query.set("to", args.to);
    return this.invoke<EbicsStaResult>({
      op: "sta",
      method: "GET",
      path: `/ebics/sta?${query.toString()}`,
      ctx,
      parse: (raw) => {
        const base = parseRawPayload(raw);
        const obj = raw as Record<string, unknown>;
        return {
          ...base,
          from: requireString(obj, "from"),
          to: requireString(obj, "to"),
        };
      },
      hashOf: (parsed) => ({ kind: "raw", rawBase64: parsed.rawBase64, rawBytes: parsed.rawBytes }),
      extra: (parsed) => ({ from: parsed.from, to: parsed.to }),
    });
  }

  async cct(
    args: { pain001: Uint8Array | string },
    ctx: ClientCallContext,
  ): Promise<EbicsCallResult<EbicsCctResult>> {
    const body: BodyInit =
      typeof args.pain001 === "string"
        ? args.pain001
        : (args.pain001.buffer.slice(
            args.pain001.byteOffset,
            args.pain001.byteOffset + args.pain001.byteLength,
          ) as ArrayBuffer);
    if (
      (typeof args.pain001 === "string" && args.pain001.length === 0) ||
      (args.pain001 instanceof Uint8Array && args.pain001.byteLength === 0)
    ) {
      throw new Error("cct: pain.001 body is empty");
    }
    return this.invoke<EbicsCctResult>({
      op: "cct",
      method: "POST",
      path: "/ebics/cct",
      contentType: "application/xml",
      body,
      ctx,
      parse: (raw) => {
        if (!isPlainObject(raw)) throw new Error("Body is not an object");
        return {
          requestId: requireString(raw, "requestId"),
          bankOrderId: requireString(raw, "bankOrderId"),
          payloadBytes: requireNumber(raw, "payloadBytes"),
        };
      },
      hashOf: (parsed) => ({
        kind: "json",
        payload: { bankOrderId: parsed.bankOrderId, payloadBytes: parsed.payloadBytes },
      }),
      extra: (parsed) => ({
        bank_order_id: parsed.bankOrderId,
        payload_bytes: parsed.payloadBytes,
      }),
    });
  }

  // -------------------------------------------------------------------------
  // Internal: request + retry + audit-chain write.
  // -------------------------------------------------------------------------

  private async invoke<T>(args: InvokeArgs<T>): Promise<EbicsCallResult<T>> {
    const result = await this.withRetry<T>(args);

    const hash = args.hashOf(result);
    const payloadHash =
      hash.kind === "raw"
        ? computeRawPayloadHash(hash.rawBase64, (result as { requestId: string }).requestId)
        : computeJsonPayloadHash(hash.payload, (result as { requestId: string }).requestId);

    const audit = await writeEbicsAuditChainEntry(this.supabase, {
      companyId: args.ctx.companyId,
      actorUserId: args.ctx.actorUserId,
      op: args.op,
      requestId: (result as { requestId: string }).requestId,
      hostId: this.config.hostId,
      rawBytes: hash.kind === "raw" ? hash.rawBytes : undefined,
      payloadHash,
      extra: args.extra ? args.extra(result) : undefined,
    });

    return { result, audit };
  }

  private async withRetry<T>(args: InvokeArgs<T>): Promise<T> {
    const max = Math.max(1, this.config.maxAttempts);
    let lastError: EbicsClientError | null = null;
    for (let attempt = 1; attempt <= max; attempt += 1) {
      try {
        return await this.doRequest<T>(args, attempt);
      } catch (err) {
        if (!(err instanceof EbicsClientError)) throw err;
        lastError = err;
        if (!isRetryableError(err) || attempt === max) throw err;
        const delay = this.backoffDelay(attempt);
        this.logger({
          level: "warn",
          msg: "ebics.sidecar.retry",
          op: args.op,
          hostId: this.config.hostId,
          requestId: err.requestId,
          attempt,
          errorCode: err.code,
          httpStatus: err.httpStatus,
        });
        await this.sleep(delay);
      }
    }
    // Unreachable — the loop either returns or throws.
    throw lastError ?? new Error("ebics.sidecar: retry loop exited without result");
  }

  private backoffDelay(attempt: number): number {
    const base = this.config.baseBackoffMs * 2 ** (attempt - 1);
    const jitter = base * this.random();
    return Math.floor(base + jitter);
  }

  private async doRequest<T>(args: InvokeArgs<T>, attempt: number): Promise<T> {
    const url = `${this.config.baseUrl}${args.path}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (args.contentType) headers["Content-Type"] = args.contentType;
    if (this.config.bearerToken) headers["Authorization"] = `Bearer ${this.config.bearerToken}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const started = Date.now();

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: args.method,
        headers,
        body: args.body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const aborted =
        (err instanceof Error && err.name === "AbortError") ||
        (typeof err === "object" && err !== null && "name" in err && (err as { name: string }).name === "AbortError");
      if (aborted) {
        const e = new EbicsTimeoutError({
          op: args.op,
          hostId: this.config.hostId,
          timeoutMs: this.config.timeoutMs,
          attempt,
        });
        this.logFailure(e, started);
        throw e;
      }
      const e = new EbicsNetworkError({
        op: args.op,
        hostId: this.config.hostId,
        attempt,
        cause: err,
      });
      this.logFailure(e, started);
      throw e;
    }
    clearTimeout(timeoutId);

    const rawBody = await response.text();
    const durationMs = Date.now() - started;

    if (response.status === 502) {
      const body = safeParseErrorBody(rawBody);
      const err = new EbicsLibraryError({
        op: args.op,
        hostId: this.config.hostId,
        httpStatus: response.status,
        body,
        requestId: asString(body) ? null : null,
        rawBody,
        attempt,
      });
      this.logger({
        level: "error",
        msg: "ebics.sidecar.library_error",
        op: args.op,
        hostId: this.config.hostId,
        requestId: null,
        attempt,
        durationMs,
        httpStatus: response.status,
        errorCode: err.code,
      });
      throw err;
    }

    if (response.status >= 400 && response.status < 500) {
      const err = new EbicsBadRequestError({
        op: args.op,
        hostId: this.config.hostId,
        httpStatus: response.status,
        rawBody,
        attempt,
      });
      this.logger({
        level: "error",
        msg: "ebics.sidecar.bad_request",
        op: args.op,
        hostId: this.config.hostId,
        requestId: null,
        attempt,
        durationMs,
        httpStatus: response.status,
        errorCode: err.code,
      });
      throw err;
    }

    if (response.status >= 500 || !response.ok) {
      const err = new EbicsUnexpectedStatusError({
        op: args.op,
        hostId: this.config.hostId,
        httpStatus: response.status,
        rawBody,
        attempt,
      });
      this.logger({
        level: "error",
        msg: "ebics.sidecar.unexpected_status",
        op: args.op,
        hostId: this.config.hostId,
        requestId: null,
        attempt,
        durationMs,
        httpStatus: response.status,
        errorCode: err.code,
      });
      throw err;
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody) as unknown;
    } catch {
      const err = new EbicsInvalidResponseError({
        op: args.op,
        hostId: this.config.hostId,
        rawBody,
        attempt,
      });
      this.logFailure(err, started, durationMs);
      throw err;
    }

    let parsed: T;
    try {
      parsed = args.parse(json);
    } catch {
      const err = new EbicsInvalidResponseError({
        op: args.op,
        hostId: this.config.hostId,
        rawBody,
        attempt,
      });
      this.logFailure(err, started, durationMs);
      throw err;
    }

    const requestId = (parsed as { requestId?: string }).requestId ?? null;
    this.logger({
      level: "info",
      msg: "ebics.sidecar.ok",
      op: args.op,
      hostId: this.config.hostId,
      requestId,
      attempt,
      durationMs,
      httpStatus: response.status,
    });
    return parsed;
  }

  private logFailure(err: EbicsClientError, startedAt: number, overrideDurationMs?: number): void {
    this.logger({
      level: "error",
      msg: `ebics.sidecar.${err.code}`,
      op: err.op,
      hostId: err.hostId,
      requestId: err.requestId,
      attempt: err.attempt,
      durationMs: overrideDurationMs ?? Date.now() - startedAt,
      httpStatus: err.httpStatus,
      errorCode: err.code,
    });
  }
}

function safeParseErrorBody(raw: string): EbicsSidecarErrorBody {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isPlainObject(parsed)) {
      const error = asString(parsed.error) ?? "ebics-failure";
      const message = asString(parsed.message) ?? undefined;
      const op = asString(parsed.op) ?? undefined;
      return { error, message, op };
    }
  } catch {
    // fall through
  }
  return { error: "ebics-failure", message: raw.slice(0, 512) };
}
