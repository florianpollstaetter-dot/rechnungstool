// ORA-2310 — Treasury Phase 3 W3.5 EBICS happy-path helpers.
//
// Companions to `treasury.ts`. These helpers cover the parts of the EBICS
// roundtrip that the spec needs to set up or assert against:
//   - probe whether ORA-2308 (`/api/treasury/ebics/setup/connection`) and
//     ORA-2307 (`GET /api/treasury/ebics/poll`) are deployed at BASE_URL
//   - drive the four wizard POSTs from inside a logged-in Playwright page,
//     so the same browser session that the user would walk through actually
//     issues the requests
//   - seed a `treasury_bank_connections` (plural) row + matching
//     `treasury_bank_accounts` row that the poller's `selectDueConnections`
//     can pick up, using service-role
//   - call `GET /api/treasury/ebics/poll` with the test CRON_SECRET so the
//     spec can drive a deterministic cron tick instead of waiting on a
//     real Vercel-Cron schedule
//   - tear the EBICS-specific rows down at the end of the suite
//
// Why service-role seeds the polling row: ORA-2307 and ORA-2308 currently
// store EBICS subscriber data in two disjoint tables
// (`treasury_bank_connection` singular for the wizard, `treasury_bank_connections`
// plural for the poller). Reconciling them belongs to the integration step
// of ORA-2288 (the parent EBICS-Polling-Implementation epic) — not to this
// spec. Until then this helper bridges the gap so the happy-path roundtrip
// can be exercised end-to-end against the docker-compose mock + sidecar.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

import { loadEnv } from "./env";

export interface WizardConnectionParams {
  bank_preset: "manual" | "erste" | "sparkasse" | "deutsche_bank";
  bank_name: string;
  host_url: string;
  host_id: string;
  partner_id: string;
  user_id: string;
  customer_id: string;
  system_id?: string | null;
  ebics_version: "H004" | "H005";
}

export interface WizardConnection {
  id: string;
  company_id: string;
  setup_status: string;
  host_id: string;
  partner_id: string;
  user_id: string;
  activated_at: string | null;
}

interface SetupApiResponse {
  ok: boolean;
  connection?: WizardConnection;
  error?: string;
  stage?: string;
}

function service(): SupabaseClient {
  const env = loadEnv();
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function isSetupApiDeployed(baseUrl: string): Promise<boolean> {
  // A connection-creation POST with no body returns either a 400 (route hit,
  // input invalid) or a 401 (admin-gate without a session). Both prove the
  // route exists. A 404 / HTML page proves it does not.
  try {
    const probe = await fetch(`${baseUrl}/api/treasury/ebics/setup/connection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      redirect: "manual",
    });
    const contentType = probe.headers.get("content-type") ?? "";
    return contentType.includes("application/json");
  } catch {
    return false;
  }
}

export async function isPollApiDeployed(baseUrl: string): Promise<boolean> {
  // Unauthenticated GET returns 401 JSON when the route exists; HTML/307 when
  // it does not.
  try {
    const probe = await fetch(`${baseUrl}/api/treasury/ebics/poll`, {
      method: "GET",
      redirect: "manual",
    });
    const contentType = probe.headers.get("content-type") ?? "";
    return contentType.includes("application/json");
  } catch {
    return false;
  }
}

async function postSetup<T extends SetupApiResponse>(
  page: Page,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const result = await page.evaluate(
    async ({ path, body }) => {
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { ok: false, error: `non-JSON response (${r.status}): ${text.slice(0, 200)}` };
      }
      return { status: r.status, body: parsed };
    },
    { path, body },
  );
  if (result.status >= 400) {
    const err = (result.body as { error?: string })?.error ?? `HTTP ${result.status}`;
    throw new Error(`${path} failed: ${err}`);
  }
  return result.body as T;
}

export async function wizardCreateConnection(
  page: Page,
  params: WizardConnectionParams,
): Promise<WizardConnection> {
  const res = await postSetup<SetupApiResponse>(page, "/api/treasury/ebics/setup/connection", {
    ...params,
    system_id: params.system_id ?? null,
  });
  if (!res.ok || !res.connection) throw new Error("setup/connection returned no row");
  return res.connection;
}

export async function wizardRunIniHia(page: Page, connectionId: string): Promise<WizardConnection> {
  const res = await postSetup<SetupApiResponse>(page, "/api/treasury/ebics/setup/init", {
    connectionId,
  });
  if (!res.ok || !res.connection) throw new Error("setup/init returned no row");
  return res.connection;
}

export async function wizardRunHkd(page: Page, connectionId: string): Promise<WizardConnection> {
  const res = await postSetup<SetupApiResponse>(page, "/api/treasury/ebics/setup/hkd", {
    connectionId,
  });
  if (!res.ok || !res.connection) throw new Error("setup/hkd returned no row");
  return res.connection;
}

export async function wizardRunHev(page: Page, connectionId: string): Promise<WizardConnection> {
  const res = await postSetup<SetupApiResponse>(page, "/api/treasury/ebics/setup/hev", {
    connectionId,
  });
  if (!res.ok || !res.connection) throw new Error("setup/hev returned no row");
  return res.connection;
}

export interface PollerSeed {
  connectionId: string;
  accountId: string;
  entityId: string;
}

export interface PollerSeedParams {
  companyId: string;
  bankBic: string;
  bankName: string;
  hostId: string;
  partnerId: string;
  userId: string;
  iban: string;
  legalName: string;
  sidecarBaseUrl?: string;
}

/**
 * Seed a poller-ready `treasury_bank_connections` row + matching
 * `treasury_bank_accounts` row so `selectDueConnections` returns a tickable
 * connection. Uses service-role to bypass RLS.
 */
export async function seedPollerConnection(p: PollerSeedParams): Promise<PollerSeed> {
  const svc = service();

  const entity = await svc
    .from("treasury_entities")
    .insert({ company_id: p.companyId, legal_name: p.legalName, currency: "EUR" })
    .select("id")
    .single();
  if (entity.error) throw new Error(`treasury_entities insert: ${entity.error.message}`);
  const entityId = (entity.data as { id: string }).id;

  const conn = await svc
    .from("treasury_bank_connections")
    .insert({
      company_id: p.companyId,
      bank_bic: p.bankBic,
      bank_name: p.bankName,
      ebics_host_id: p.hostId,
      ebics_partner_id: p.partnerId,
      ebics_user_id: p.userId,
      sidecar_base_url: p.sidecarBaseUrl ?? null,
      timezone: "Europe/Vienna",
      status: "active",
    })
    .select("id")
    .single();
  if (conn.error) throw new Error(`treasury_bank_connections insert: ${conn.error.message}`);
  const connectionId = (conn.data as { id: string }).id;

  const account = await svc
    .from("treasury_bank_accounts")
    .insert({
      company_id: p.companyId,
      entity_id: entityId,
      bank_bic: p.bankBic,
      bank_name: p.bankName,
      iban: p.iban,
      currency: "EUR",
      status: "active",
      connection_id: connectionId,
    })
    .select("id")
    .single();
  if (account.error) throw new Error(`treasury_bank_accounts insert: ${account.error.message}`);
  const accountId = (account.data as { id: string }).id;

  return { connectionId, accountId, entityId };
}

export interface PollResponseBody {
  ok: boolean;
  ranAt?: string;
  connections?: number;
  results?: Array<{
    connectionId: string;
    hostId: string;
    outcome: {
      kind: "skipped" | "ok" | "error";
      reason?: string;
      code?: string;
      statementId?: string | null;
      transactions?: number;
      duplicate?: boolean;
      breakerOpened?: boolean;
    };
  }>;
  error?: string;
}

export async function triggerPoll(baseUrl: string, cronSecret: string): Promise<PollResponseBody> {
  const r = await fetch(`${baseUrl}/api/treasury/ebics/poll`, {
    method: "GET",
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const text = await r.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`poll route returned non-JSON (${r.status}): ${text.slice(0, 200)}`);
  }
  if (r.status >= 400) {
    throw new Error(`poll route failed (${r.status}): ${(body as { error?: string }).error ?? "unknown"}`);
  }
  return body as PollResponseBody;
}

export interface AuditChainStats {
  total: number;
  staCount: number;
  hevCount: number;
  requestIds: string[];
}

export async function readAuditChain(companyId: string): Promise<AuditChainStats> {
  const svc = service();
  const { data, error } = await svc
    .from("treasury_audit_chain")
    .select("event_type, payload")
    .eq("company_id", companyId);
  if (error) throw new Error(`treasury_audit_chain select: ${error.message}`);
  const rows = (data as Array<{ event_type: string; payload: { request_id?: string } }>) ?? [];
  const requestIds = rows
    .map((r) => r.payload?.request_id)
    .filter((v): v is string => typeof v === "string");
  return {
    total: rows.length,
    staCount: rows.filter((r) => r.event_type === "ebics.sta").length,
    hevCount: rows.filter((r) => r.event_type === "ebics.hev").length,
    requestIds,
  };
}

export interface CountsSnapshot {
  statements: number;
  transactions: number;
  auditChain: number;
}

export async function snapshotCounts(companyId: string): Promise<CountsSnapshot> {
  const svc = service();
  const [stmt, txn, audit] = await Promise.all([
    svc.from("treasury_statements").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    svc.from("treasury_transactions").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    svc.from("treasury_audit_chain").select("seq", { count: "exact", head: true }).eq("company_id", companyId),
  ]);
  if (stmt.error) throw new Error(`statements count: ${stmt.error.message}`);
  if (txn.error) throw new Error(`transactions count: ${txn.error.message}`);
  if (audit.error) throw new Error(`audit_chain count: ${audit.error.message}`);
  return {
    statements: stmt.count ?? 0,
    transactions: txn.count ?? 0,
    auditChain: audit.count ?? 0,
  };
}

export async function cleanupEbicsFor(companyId: string): Promise<void> {
  const svc = service();
  // Order: transactions → statements → accounts → connections (plural) →
  // bank_connection (singular wizard table) → entities → audit_chain.
  await svc.from("treasury_transactions").delete().eq("company_id", companyId);
  await svc.from("treasury_statements").delete().eq("company_id", companyId);
  await svc.from("treasury_bank_accounts").delete().eq("company_id", companyId);
  await svc.from("treasury_bank_connections").delete().eq("company_id", companyId);
  // `treasury_bank_connection` (singular) is the ORA-2308 wizard table.
  // Tolerate missing-table errors when the ORA-2308 migration has not been
  // applied to the target Supabase yet.
  const wizardDel = await svc.from("treasury_bank_connection").delete().eq("company_id", companyId);
  if (wizardDel.error && !/relation .* does not exist/i.test(wizardDel.error.message)) {
    throw new Error(`treasury_bank_connection delete: ${wizardDel.error.message}`);
  }
  await svc.from("treasury_entities").delete().eq("company_id", companyId);
  await svc.from("treasury_audit_chain").delete().eq("company_id", companyId);
}
