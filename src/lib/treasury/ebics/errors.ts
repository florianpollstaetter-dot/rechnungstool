// ORA-2306 — Typed error hierarchy for the EBICS sidecar consumer client.
//
// Every error carries the sidecar `requestId` (when known) so the Next.js
// caller can correlate the failure with the sidecar logs and write a failed
// audit-chain entry without parsing free-form stack traces.

import type { EbicsOp, EbicsSidecarErrorBody } from "./types";

export type EbicsClientErrorCode =
  | "network"
  | "timeout"
  | "library"
  | "bad_request"
  | "unexpected_status"
  | "invalid_response";

export class EbicsClientError extends Error {
  readonly code: EbicsClientErrorCode;
  readonly op: EbicsOp;
  readonly hostId: string;
  readonly requestId: string | null;
  readonly httpStatus: number | null;
  readonly rawBody: string | null;
  readonly attempt: number;

  constructor(args: {
    code: EbicsClientErrorCode;
    op: EbicsOp;
    hostId: string;
    message: string;
    requestId?: string | null;
    httpStatus?: number | null;
    rawBody?: string | null;
    attempt?: number;
    cause?: unknown;
  }) {
    super(args.message);
    this.name = new.target.name;
    this.code = args.code;
    this.op = args.op;
    this.hostId = args.hostId;
    this.requestId = args.requestId ?? null;
    this.httpStatus = args.httpStatus ?? null;
    this.rawBody = args.rawBody ?? null;
    this.attempt = args.attempt ?? 1;
    if (args.cause !== undefined) {
      // REASON: Error.cause is part of ES2022; widen to satisfy older lib targets.
      (this as { cause?: unknown }).cause = args.cause;
    }
  }

  toLogObject(): Record<string, unknown> {
    return {
      code: this.code,
      op: this.op,
      hostId: this.hostId,
      requestId: this.requestId,
      httpStatus: this.httpStatus,
      attempt: this.attempt,
      message: this.message,
    };
  }
}

/** Sidecar replied with 502 `{ error, op, message }` — upstream library failure. */
export class EbicsLibraryError extends EbicsClientError {
  readonly sidecarError: string;

  constructor(args: {
    op: EbicsOp;
    hostId: string;
    httpStatus: number;
    body: EbicsSidecarErrorBody;
    requestId?: string | null;
    rawBody: string;
    attempt: number;
  }) {
    super({
      code: "library",
      op: args.op,
      hostId: args.hostId,
      message:
        args.body.message ?? args.body.error ?? `EBICS sidecar library error (${args.op})`,
      requestId: args.requestId ?? null,
      httpStatus: args.httpStatus,
      rawBody: args.rawBody,
      attempt: args.attempt,
    });
    this.sidecarError = args.body.error;
  }
}

/** Network-level failure (DNS, connection reset, fetch threw). */
export class EbicsNetworkError extends EbicsClientError {
  constructor(args: { op: EbicsOp; hostId: string; attempt: number; cause: unknown }) {
    const causeMessage = args.cause instanceof Error ? args.cause.message : String(args.cause);
    super({
      code: "network",
      op: args.op,
      hostId: args.hostId,
      message: `EBICS sidecar network error: ${causeMessage}`,
      attempt: args.attempt,
      cause: args.cause,
    });
  }
}

/** Request exceeded the configured timeout. */
export class EbicsTimeoutError extends EbicsClientError {
  readonly timeoutMs: number;

  constructor(args: { op: EbicsOp; hostId: string; timeoutMs: number; attempt: number }) {
    super({
      code: "timeout",
      op: args.op,
      hostId: args.hostId,
      message: `EBICS sidecar timed out after ${args.timeoutMs}ms`,
      attempt: args.attempt,
    });
    this.timeoutMs = args.timeoutMs;
  }
}

/** Sidecar rejected the call with 4xx (typically 400 — bad pain.001, bad date). */
export class EbicsBadRequestError extends EbicsClientError {
  constructor(args: {
    op: EbicsOp;
    hostId: string;
    httpStatus: number;
    rawBody: string;
    attempt: number;
  }) {
    super({
      code: "bad_request",
      op: args.op,
      hostId: args.hostId,
      message: `EBICS sidecar rejected request (HTTP ${args.httpStatus})`,
      httpStatus: args.httpStatus,
      rawBody: args.rawBody,
      attempt: args.attempt,
    });
  }
}

/** Sidecar replied with an unexpected status code (5xx other than 502). */
export class EbicsUnexpectedStatusError extends EbicsClientError {
  constructor(args: {
    op: EbicsOp;
    hostId: string;
    httpStatus: number;
    rawBody: string;
    attempt: number;
  }) {
    super({
      code: "unexpected_status",
      op: args.op,
      hostId: args.hostId,
      message: `EBICS sidecar returned unexpected status ${args.httpStatus}`,
      httpStatus: args.httpStatus,
      rawBody: args.rawBody,
      attempt: args.attempt,
    });
  }
}

/** Sidecar responded with 2xx but the body did not parse as the expected JSON shape. */
export class EbicsInvalidResponseError extends EbicsClientError {
  constructor(args: { op: EbicsOp; hostId: string; rawBody: string; attempt: number }) {
    super({
      code: "invalid_response",
      op: args.op,
      hostId: args.hostId,
      message: `EBICS sidecar returned an unparseable body for ${args.op}`,
      rawBody: args.rawBody,
      attempt: args.attempt,
    });
  }
}

/** Retry policy: which error codes are worth retrying. */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof EbicsClientError)) return false;
  return err.code === "network" || err.code === "timeout" || err.code === "unexpected_status";
}
