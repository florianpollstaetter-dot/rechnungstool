// ORA-2306 — Typed response shapes for the EBICS sidecar REST surface.
//
// Mirrors `EbicsClientFacade` from
// `treasury-poc/services/ebics-sidecar-java/src/main/java/com/orangeocto/ebics/EbicsClientFacade.java`
// (shipped by ORA-2297, master `6c0219e`).
//
// Contract with the sidecar:
//   - Every successful response carries `requestId` (sidecar-issued UUID) and,
//     for payload-bearing operations, `rawBase64` (the raw bank bytes encoded
//     as base64). The Next.js consumer hashes those raw bytes into
//     `treasury_audit_chain` — the sidecar never writes the chain.
//   - Errors propagate as HTTP 502 with a JSON body `{ error, op, message }`,
//     surfaced as `EbicsLibraryError`.

/** Common fields on every sidecar response. */
export interface EbicsResponseBase {
  requestId: string;
}

/** Common fields on every payload-bearing sidecar response. */
export interface EbicsRawPayloadResponse extends EbicsResponseBase {
  /** Raw bank payload, base64-encoded. May be empty for INI/HIA-style calls. */
  rawBase64: string;
  /** Decoded byte-length of `rawBase64` as reported by the sidecar. */
  rawBytes: number;
}

/** `POST /ebics/init` — INI + HIA subscriber bootstrap. */
export interface EbicsInitResult extends EbicsResponseBase {
  iniOrderId: string;
  hiaOrderId: string;
}

/** `GET /ebics/hpb` — fetch bank public keys (E002/X002). */
export type EbicsHpbResult = EbicsRawPayloadResponse;

/** `GET /ebics/hev` — probe supported EBICS protocol versions. */
export interface EbicsHevResult extends EbicsRawPayloadResponse {
  supportedVersion: string;
}

/** `GET /ebics/hkd` — subscriber state + authorized order types. */
export type EbicsHkdResult = EbicsRawPayloadResponse;

/** `GET /ebics/sta?from=&to=` — CAMT.053 download. `rawBase64` is the CAMT-XML bytes. */
export interface EbicsStaResult extends EbicsRawPayloadResponse {
  from: string;
  to: string;
}

/** `POST /ebics/cct` — pain.001 upload. No raw bank payload to hash. */
export interface EbicsCctResult extends EbicsResponseBase {
  bankOrderId: string;
  payloadBytes: number;
}

/** Sidecar 502 body shape — surfaced as `EbicsLibraryError`. */
export interface EbicsSidecarErrorBody {
  error: string;
  op?: string;
  message?: string;
}

/** Per-connection sidecar configuration resolved from env / DB. */
export interface SidecarConnectionConfig {
  /** Stable identifier for this connection (typically `ebics_host_id`). */
  hostId: string;
  /** Sidecar base URL, e.g. `https://ebics-sidecar.internal`. No trailing slash. */
  baseUrl: string;
  /** Optional bearer token; omitted if the sidecar is reachable only intra-VPC. */
  bearerToken?: string;
  /** Per-request timeout in milliseconds. Defaults to 30_000. */
  timeoutMs: number;
  /** Max retry attempts (including the first call). Defaults to 3. */
  maxAttempts: number;
  /** Base backoff in milliseconds; actual delay applies exponential + jitter. Defaults to 250. */
  baseBackoffMs: number;
}

/** Logical EBICS operation identifier — used for logging, retry policy, audit. */
export type EbicsOp = "init" | "hpb" | "hev" | "hkd" | "sta" | "cct";
