// ORA-2306 — Public surface of the Next.js EBICS sidecar consumer client.

export {
  EbicsSidecarClient,
  type ClientCallContext,
  type EbicsCallResult,
  type EbicsSidecarClientOptions,
  type LogRecord,
  type Logger,
} from "./sidecar-client";

export type {
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

export {
  EbicsBadRequestError,
  EbicsClientError,
  EbicsInvalidResponseError,
  EbicsLibraryError,
  EbicsNetworkError,
  EbicsTimeoutError,
  EbicsUnexpectedStatusError,
  isRetryableError,
  type EbicsClientErrorCode,
} from "./errors";

export {
  loadSidecarConfig,
  SidecarConfigError,
  type LoadConfigOptions,
} from "./config";

export {
  computeJsonPayloadHash,
  computeRawPayloadHash,
  writeEbicsAuditChainEntry,
  EBICS_AUDIT_EVENT,
  type AuditChainEntryInput,
  type AuditChainWriteResult,
} from "./audit-chain";

// ORA-2308 — Wizard backend helpers.
export {
  BANK_PRESETS,
  EbicsSetupError,
  runHevProbe,
  runHpbHkdSync,
  runIniHiaBootstrap,
  upsertConnectionDraft,
  validateBankConnectorInput,
  type BankConnectorInput,
  type BankPresetDescriptor,
} from "./setup";
