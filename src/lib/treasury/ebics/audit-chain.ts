// ORA-2306 — Single-writer for `treasury_audit_chain` against sidecar payloads.
//
// Invariant: every sidecar call produces exactly one `treasury_audit_chain` row
// per `requestId`. The sidecar (Java) never writes the chain — only this
// module does, on the Next.js side. That keeps the chain's append-only
// guarantee under one writer.
//
// Hash computation:
//   - For payload-bearing ops: `sha256(rawBytes || ":" || requestId)` over the
//     decoded raw bank payload.
//   - For payloadless ops (init/cct): `sha256(JSON(opPayload) || ":" || requestId)`
//     over the deterministic JSON of the typed result (sorted keys).
//
// The chain itself is hash-linked by the row's `previous_hash` field — that
// linkage is computed by a DB trigger in the Phase-0+1 schema, not here.
// This writer only computes the payload hash and inserts the row.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EbicsOp } from "./types";

/** Event-type strings — kept in sync with the audit-log taxonomy. */
export const EBICS_AUDIT_EVENT: Record<EbicsOp, string> = {
  init: "ebics.init",
  hpb: "ebics.hpb",
  hev: "ebics.hev",
  hkd: "ebics.hkd",
  sta: "ebics.sta",
  cct: "ebics.cct",
};

/** Stable JSON.stringify with sorted keys — used for payloadless hashes. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`);
  return `{${parts.join(",")}}`;
}

/** Compute `sha256(rawBase64-bytes || ":" || requestId)` as a lowercase hex digest. */
export function computeRawPayloadHash(rawBase64: string, requestId: string): string {
  const bytes = Buffer.from(rawBase64, "base64");
  return createHash("sha256")
    .update(bytes)
    .update(":")
    .update(requestId)
    .digest("hex");
}

/** Compute `sha256(stableJSON(payload) || ":" || requestId)` as a lowercase hex digest. */
export function computeJsonPayloadHash(payload: unknown, requestId: string): string {
  return createHash("sha256")
    .update(stableStringify(payload))
    .update(":")
    .update(requestId)
    .digest("hex");
}

export interface AuditChainEntryInput {
  companyId: string;
  actorUserId: string | null;
  op: EbicsOp;
  requestId: string;
  hostId: string;
  /** Optional decoded byte length (helps forensics; not part of the hash input). */
  rawBytes?: number;
  /** Hash already computed via `computeRawPayloadHash` / `computeJsonPayloadHash`. */
  payloadHash: string;
  /** Extra metadata stored alongside the entry. Must be JSON-serializable. */
  extra?: Record<string, unknown>;
}

export interface AuditChainWriteResult {
  /** True if a new row was inserted; false if the entry already existed. */
  inserted: boolean;
  /** `treasury_audit_chain.seq` of the (existing or new) row. */
  seq: number;
}

/** Minimal Supabase surface this module touches — keeps tests trivial. */
type AuditSupabase = Pick<SupabaseClient, "from">;

/**
 * Write the chain entry. Idempotent on `(company_id, payload->>request_id, event_type)` —
 * if a row already exists for the same request, we return `inserted: false`
 * with the existing seq. This lets the sidecar client safely re-issue an
 * audit-chain write after a partial failure without forking the chain.
 *
 * Implementation notes:
 *   - Pre-check by `event_type` + `payload->>request_id` (server-side filter).
 *   - The chain row links itself to the previous row via a DB trigger; this
 *     writer never computes `previous_hash` directly.
 *   - On conflict we re-read instead of letting an UPSERT race — the chain
 *     must remain append-only without ON CONFLICT UPDATE.
 */
export async function writeEbicsAuditChainEntry(
  supabase: AuditSupabase,
  entry: AuditChainEntryInput,
): Promise<AuditChainWriteResult> {
  const eventType = EBICS_AUDIT_EVENT[entry.op];
  const payload: Record<string, unknown> = {
    request_id: entry.requestId,
    host_id: entry.hostId,
    payload_hash: entry.payloadHash,
    raw_bytes: entry.rawBytes ?? null,
    ...(entry.extra ?? {}),
  };

  const existing = await supabase
    .from("treasury_audit_chain")
    .select("seq")
    .eq("company_id", entry.companyId)
    .eq("event_type", eventType)
    // Supabase JSONB lookup: filter `payload->>request_id` == requestId.
    .filter("payload->>request_id", "eq", entry.requestId)
    .maybeSingle();

  if (existing.error && existing.error.code !== "PGRST116") {
    throw existing.error;
  }
  if (existing.data && typeof existing.data.seq === "number") {
    return { inserted: false, seq: existing.data.seq };
  }

  const inserted = await supabase
    .from("treasury_audit_chain")
    .insert({
      company_id: entry.companyId,
      event_type: eventType,
      actor_user_id: entry.actorUserId,
      payload,
      // previous_hash + hash are computed by the chain's DB trigger.
      previous_hash: "",
      hash: entry.payloadHash,
    })
    .select("seq")
    .single();

  if (inserted.error) throw inserted.error;
  return { inserted: true, seq: inserted.data.seq as number };
}
