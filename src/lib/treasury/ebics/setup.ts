// ORA-2308 — Backend operations for the EBICS INI/HIA-Setup-Wizard.
// ORA-2312 — Reconciled to the plural `treasury_bank_connections` table that
// the W3.2 poller already reads. Column names follow the table:
//   wire-name   → DB column
//   host_id     → ebics_host_id
//   partner_id  → ebics_partner_id
//   user_id     → ebics_user_id
//   last_error  → last_error_message
//
// Responsibilities:
//   - Persist the connection draft from Step 1 (Bank-Connector).
//   - Drive the sidecar through INI/HIA (Step 2), HPB+HKD (Step 3), HEV
//     (Step 4) — exactly one sidecar call per wizard action.
//   - Update the connection row's `setup_status` machine so the UI can resume
//     a half-finished setup on a fresh visit.
//
// Decoupling: only depends on `@/lib/treasury/ebics/{sidecar-client,config}`
// + Supabase + the connection row. No imports from non-Treasury domains.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  EbicsClientError,
  EbicsSidecarClient,
  loadSidecarConfig,
} from "./index";
import type {
  EbicsBankPreset,
  EbicsConnectionStatus,
  EbicsVersion,
  TreasuryBankConnection,
} from "../types";

const TABLE = "treasury_bank_connections";

export interface BankConnectorInput {
  bank_preset: EbicsBankPreset;
  bank_name: string;
  host_url: string;
  host_id: string;
  partner_id: string;
  user_id: string;
  customer_id: string;
  system_id?: string | null;
  ebics_version?: EbicsVersion;
}

/**
 * Hausbank-Presets. The host_url is a sensible starting URL; admins can edit
 * it before saving the draft (e.g. for sandbox endpoints).
 */
export interface BankPresetDescriptor {
  preset: EbicsBankPreset;
  /** Short, brand-neutral label rendered as the option title. */
  bankName: string;
  /** Suggested EBICS host URL — real prod URLs the bank publishes. */
  hostUrl: string;
  /** Suggested host ID (free-text on bank side, but presets stick to common names). */
  hostId: string;
  ebicsVersion: EbicsVersion;
}

export const BANK_PRESETS: ReadonlyArray<BankPresetDescriptor> = [
  {
    preset: "erste",
    bankName: "Erste Bank Wien",
    hostUrl: "https://ebics.erstebank.at/ebicsweb/ebicsweb",
    hostId: "EBIXEBAT",
    ebicsVersion: "H005",
  },
  {
    preset: "sparkasse",
    bankName: "Sparkasse",
    hostUrl: "https://ebics.sparkasse.at/ebicsweb/ebicsweb",
    hostId: "EBIXSPAT",
    ebicsVersion: "H005",
  },
  {
    preset: "deutsche_bank",
    bankName: "Deutsche Bank",
    hostUrl: "https://ebics.deutsche-bank.de/ebicsweb/ebicsweb",
    hostId: "DEUTDEFF",
    ebicsVersion: "H005",
  },
  {
    preset: "manual",
    bankName: "",
    hostUrl: "",
    hostId: "",
    ebicsVersion: "H005",
  },
];

export class EbicsSetupError extends Error {
  readonly stage: "save_draft" | "init" | "hpb" | "hkd" | "hev";
  readonly cause: unknown;
  constructor(stage: EbicsSetupError["stage"], message: string, cause?: unknown) {
    super(message);
    this.name = "EbicsSetupError";
    this.stage = stage;
    this.cause = cause;
  }
}

const REQUIRED_FIELDS: Array<keyof BankConnectorInput> = [
  "bank_preset",
  "bank_name",
  "host_url",
  "host_id",
  "partner_id",
  "user_id",
  "customer_id",
];

export function validateBankConnectorInput(input: Partial<BankConnectorInput>): string | null {
  for (const field of REQUIRED_FIELDS) {
    const v = input[field];
    if (typeof v !== "string" || v.trim().length === 0) {
      return `Pflichtfeld fehlt: ${field}`;
    }
  }
  try {
    const url = new URL(input.host_url as string);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "Host-URL muss http(s) sein.";
    }
  } catch {
    return "Host-URL ist keine gültige URL.";
  }
  return null;
}

interface UpsertOptions {
  companyId: string;
  actorUserId: string;
  input: BankConnectorInput;
}

/**
 * Persist a draft connection. If a row with the same
 * (company_id, ebics_host_id, ebics_partner_id, ebics_user_id) tuple already
 * exists, update it — admins may revisit the wizard to fix typos.
 */
export async function upsertConnectionDraft(
  service: SupabaseClient,
  opts: UpsertOptions,
): Promise<TreasuryBankConnection> {
  const err = validateBankConnectorInput(opts.input);
  if (err) throw new EbicsSetupError("save_draft", err);

  const existing = await service
    .from(TABLE)
    .select("*")
    .eq("company_id", opts.companyId)
    .eq("ebics_host_id", opts.input.host_id)
    .eq("ebics_partner_id", opts.input.partner_id)
    .eq("ebics_user_id", opts.input.user_id)
    .maybeSingle<TreasuryBankConnection>();

  const row: Partial<TreasuryBankConnection> = {
    company_id: opts.companyId,
    bank_preset: opts.input.bank_preset,
    bank_name: opts.input.bank_name,
    host_url: opts.input.host_url,
    ebics_host_id: opts.input.host_id,
    ebics_partner_id: opts.input.partner_id,
    ebics_user_id: opts.input.user_id,
    customer_id: opts.input.customer_id,
    system_id: opts.input.system_id ?? null,
    ebics_version: opts.input.ebics_version ?? "H005",
    created_by: opts.actorUserId,
  };

  if (existing.data) {
    const { data, error } = await service
      .from(TABLE)
      .update(row)
      .eq("id", existing.data.id)
      .select("*")
      .single<TreasuryBankConnection>();
    if (error || !data) {
      throw new EbicsSetupError("save_draft", error?.message ?? "Update failed", error);
    }
    return data;
  }

  const { data, error } = await service
    .from(TABLE)
    .insert({ ...row, setup_status: "draft" satisfies EbicsConnectionStatus })
    .select("*")
    .single<TreasuryBankConnection>();
  if (error || !data) {
    throw new EbicsSetupError("save_draft", error?.message ?? "Insert failed", error);
  }
  return data;
}

interface RunStepOptions {
  companyId: string;
  actorUserId: string;
  connectionId: string;
}

async function loadConnection(
  service: SupabaseClient,
  opts: RunStepOptions,
): Promise<TreasuryBankConnection> {
  const { data, error } = await service
    .from(TABLE)
    .select("*")
    .eq("id", opts.connectionId)
    .eq("company_id", opts.companyId)
    .maybeSingle<TreasuryBankConnection>();
  if (error || !data) {
    throw new EbicsSetupError(
      "save_draft",
      `Connection ${opts.connectionId} nicht gefunden für Company ${opts.companyId}`,
      error,
    );
  }
  return data;
}

async function patchConnection(
  service: SupabaseClient,
  id: string,
  patch: Partial<TreasuryBankConnection>,
): Promise<TreasuryBankConnection> {
  const { data, error } = await service
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single<TreasuryBankConnection>();
  if (error || !data) {
    throw new EbicsSetupError(
      "save_draft",
      `Connection-Update fehlgeschlagen: ${error?.message ?? "unknown"}`,
      error,
    );
  }
  return data;
}

function buildClient(connection: TreasuryBankConnection, service: SupabaseClient): EbicsSidecarClient {
  const config = loadSidecarConfig(connection.ebics_host_id);
  return new EbicsSidecarClient({ config, supabase: service });
}

/** Step 2 — INI + HIA bootstrap. */
export async function runIniHiaBootstrap(
  service: SupabaseClient,
  opts: RunStepOptions,
): Promise<TreasuryBankConnection> {
  const connection = await loadConnection(service, opts);
  const client = buildClient(connection, service);
  try {
    const { result } = await client.init({
      companyId: opts.companyId,
      actorUserId: opts.actorUserId,
    });
    // The keystore is hosted on the sidecar; its handle is the EBICS user_id
    // (the sidecar already keys its in-process keystore by user_id). Storing
    // it here lets W3.4 swap a backed-by-HSM keystore implementation without
    // any UI change.
    return patchConnection(service, connection.id, {
      setup_status: "letters_pending",
      keystore_id: connection.ebics_user_id,
      init_order_id: result.iniOrderId,
      hia_order_id: result.hiaOrderId,
      letters_generated_at: new Date().toISOString(),
      last_error_message: null,
    });
  } catch (err) {
    await patchConnection(service, connection.id, {
      setup_status: "failed",
      last_error_message: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof EbicsClientError) {
      throw new EbicsSetupError("init", err.message, err);
    }
    throw err;
  }
}

/** Step 3 — HPB (bank keys) + HKD (authorized order types) sync. */
export async function runHpbHkdSync(
  service: SupabaseClient,
  opts: RunStepOptions,
): Promise<TreasuryBankConnection> {
  const connection = await loadConnection(service, opts);
  if (connection.setup_status === "draft") {
    throw new EbicsSetupError(
      "hpb",
      "INI/HIA muss zuerst abgeschlossen werden. Bitte Schritt 2 ausführen.",
    );
  }
  const client = buildClient(connection, service);
  try {
    await client.hpb({ companyId: opts.companyId, actorUserId: opts.actorUserId });
    const hkd = await client.hkd({ companyId: opts.companyId, actorUserId: opts.actorUserId });

    // The HKD payload from the sidecar is raw bank XML (base64). Order-types
    // extraction is delegated to W3.4; here we record that the HKD round-trip
    // succeeded and let the operator activate the connection.
    const decoded = safeDecodeHkdOrderTypes(hkd.result.rawBase64);

    return patchConnection(service, connection.id, {
      setup_status: "hkd_pending",
      order_types: decoded ?? connection.order_types,
      last_hpb_at: new Date().toISOString(),
      last_error_message: null,
    });
  } catch (err) {
    await patchConnection(service, connection.id, {
      setup_status: "failed",
      last_error_message: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof EbicsClientError) {
      throw new EbicsSetupError("hkd", err.message, err);
    }
    throw err;
  }
}

/** Step 4 — HEV protocol-version probe + final activation. */
export async function runHevProbe(
  service: SupabaseClient,
  opts: RunStepOptions,
): Promise<TreasuryBankConnection> {
  const connection = await loadConnection(service, opts);
  const client = buildClient(connection, service);
  try {
    const { result } = await client.hev({
      companyId: opts.companyId,
      actorUserId: opts.actorUserId,
    });
    const version = result.supportedVersion;
    if (!version.startsWith("H005") && !version.startsWith("EBICS 3")) {
      throw new EbicsSetupError(
        "hev",
        `Bank meldet EBICS-Version ${version}; benötigt wird 3.0 (H005).`,
      );
    }
    return patchConnection(service, connection.id, {
      setup_status: "active",
      last_hev_version: version,
      activated_at: new Date().toISOString(),
      last_error_message: null,
    });
  } catch (err) {
    if (!(err instanceof EbicsSetupError)) {
      await patchConnection(service, connection.id, {
        setup_status: "failed",
        last_error_message: err instanceof Error ? err.message : String(err),
      });
    } else {
      await patchConnection(service, connection.id, {
        setup_status: "failed",
        last_error_message: err.message,
      });
    }
    if (err instanceof EbicsClientError) {
      throw new EbicsSetupError("hev", err.message, err);
    }
    throw err;
  }
}

/**
 * Best-effort HKD parser: pulls `<OrderType>…</OrderType>` tokens out of the
 * raw HKD response. We do *not* hard-fail when the regex misses — the raw
 * payload is preserved in the audit chain, and W3.4 will replace this with
 * the schema-aware parser. Returns `null` when nothing parseable was found.
 */
function safeDecodeHkdOrderTypes(rawBase64: string): string[] | null {
  try {
    const xml = Buffer.from(rawBase64, "base64").toString("utf8");
    const matches = xml.matchAll(/<\s*OrderType[^>]*>([^<]+)<\s*\/\s*OrderType\s*>/g);
    const out = new Set<string>();
    for (const m of matches) {
      const v = m[1].trim();
      if (v.length > 0) out.add(v);
    }
    return out.size > 0 ? Array.from(out).sort() : null;
  } catch {
    return null;
  }
}
