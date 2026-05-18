// ORA-2306 — Per-connection sidecar config loader.
//
// Resolves the sidecar base URL + bearer token for a given EBICS host id from
// environment variables. The shape lets the same Next.js deployment talk to
// multiple banks (each with its own sidecar fleet) without re-deploying.
//
// Lookup order (first match wins):
//   1. Per-host override:   EBICS_SIDECAR_BASE_URL__<HOSTID>
//                           EBICS_SIDECAR_BEARER_TOKEN__<HOSTID>
//   2. Global default:      EBICS_SIDECAR_BASE_URL
//                           EBICS_SIDECAR_BEARER_TOKEN
//
// Host-id characters that are not [A-Z0-9_] are normalized to `_` (so a host
// id like `EBIXBANK-PROD` becomes `EBIXBANK_PROD` in env var keys).

import type { SidecarConnectionConfig } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 250;

export class SidecarConfigError extends Error {
  readonly hostId: string;
  constructor(hostId: string, message: string) {
    super(message);
    this.name = "SidecarConfigError";
    this.hostId = hostId;
  }
}

function envKey(hostId: string): string {
  return hostId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

type EnvLike = Record<string, string | undefined>;

function readEnv(env: EnvLike, name: string): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readIntEnv(env: EnvLike, name: string, fallback: number): number {
  const raw = readEnv(env, name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface LoadConfigOptions {
  /** Override `process.env` — primarily for tests. */
  env?: EnvLike;
  /** Override the default timeout (otherwise read from env or 30s). */
  timeoutMsOverride?: number;
  /** Override the default retry attempts (otherwise 3). */
  maxAttemptsOverride?: number;
}

/**
 * Resolve sidecar config for a given EBICS host id. Throws
 * `SidecarConfigError` if no base URL is configured (neither per-host nor
 * global) — there is no safe default for the sidecar URL.
 */
export function loadSidecarConfig(
  hostId: string,
  opts: LoadConfigOptions = {},
): SidecarConnectionConfig {
  if (!hostId || hostId.trim().length === 0) {
    throw new SidecarConfigError(hostId, "hostId is required");
  }

  const env = opts.env ?? process.env;
  const key = envKey(hostId);

  const baseUrl =
    readEnv(env, `EBICS_SIDECAR_BASE_URL__${key}`) ?? readEnv(env, "EBICS_SIDECAR_BASE_URL");
  if (!baseUrl) {
    throw new SidecarConfigError(
      hostId,
      `No sidecar base URL configured. Set EBICS_SIDECAR_BASE_URL__${key} or EBICS_SIDECAR_BASE_URL.`,
    );
  }

  const bearerToken =
    readEnv(env, `EBICS_SIDECAR_BEARER_TOKEN__${key}`) ??
    readEnv(env, "EBICS_SIDECAR_BEARER_TOKEN");

  const timeoutMs =
    opts.timeoutMsOverride ?? readIntEnv(env, "EBICS_SIDECAR_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const maxAttempts =
    opts.maxAttemptsOverride ??
    readIntEnv(env, "EBICS_SIDECAR_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS);
  const baseBackoffMs = readIntEnv(
    env,
    "EBICS_SIDECAR_BASE_BACKOFF_MS",
    DEFAULT_BASE_BACKOFF_MS,
  );

  return {
    hostId,
    baseUrl: normalizeBaseUrl(baseUrl),
    bearerToken,
    timeoutMs,
    maxAttempts,
    baseBackoffMs,
  };
}
