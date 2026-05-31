// ORA-2307 — Vercel-Cron entry point for multi-bank EBICS polling.
//
// Schedule: `*/15 * * * *` (every 15 min). Configured in `vercel.json`.
//
// Authentication: Vercel-Cron requests carry an `Authorization: Bearer
// $CRON_SECRET` header (set in the Vercel project's env). Any non-matching
// request returns 401 — this is the only gate, the route never touches a
// user session.
//
// Behaviour:
//   1. Service-role Supabase client (the cron has no JWT).
//   2. `selectDueConnections` — every row with `status='active'`.
//   3. For each row: `pollConnection` (own try/catch); never let one bank's
//      failure abort the tick for the others.
//   4. Return a per-connection summary so Vercel-Cron-logs surface what
//      happened. IBANs are never serialized into the response body —
//      callers see only outcome kinds.
//
// Non-goals (deferred to W3.3/W3.4/W3.5):
//   - INI/HIA setup wizard
//   - HSM A005 signing
//   - Real-bank smoke (depends on ORA-2285 credentials)

import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/operator";
import {
  pollConnection,
  selectDueConnections,
  type PollResult,
  type BankConnectionRow,
} from "@/lib/treasury/ebics/poller";
import type { Logger, LogRecord } from "@/lib/treasury/ebics";

export const runtime = "nodejs";
// Vercel-Cron invocations should never be cached.
export const dynamic = "force-dynamic";

interface PollResponse {
  ok: true;
  ranAt: string;
  connections: number;
  results: Array<{
    connectionId: string;
    hostId: string;
    outcome: PollResult["outcome"];
  }>;
}

interface PollErrorResponse {
  ok: false;
  error: string;
}

export async function GET(request: Request): Promise<NextResponse<PollResponse | PollErrorResponse>> {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const supabase = createServiceClient();

  let connections: BankConnectionRow[];
  try {
    connections = await selectDueConnections(supabase);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "select failed" },
      { status: 500 },
    );
  }

  const now = new Date();
  const logger = buildConsoleLogger();
  const results: PollResult[] = [];

  for (const row of connections) {
    // Per-connection try/catch is an additional safety belt — `pollConnection`
    // is contractually no-throw, but a future change must not silently break
    // failure-isolation.
    try {
      const r = await pollConnection(row, {
        supabase,
        auditSupabase: supabase,
        now,
        logger,
      });
      results.push(r);
    } catch (err) {
      results.push({
        connectionId: row.id,
        hostId: row.ebics_host_id,
        outcome: {
          kind: "error",
          code: "uncaught_in_poller",
          breakerOpened: false,
        },
      });
      logger({
        level: "error",
        msg: "ebics.poll.uncaught",
        op: "sta",
        hostId: row.ebics_host_id,
        requestId: null,
        attempt: 0,
        errorCode: err instanceof Error ? err.name : "unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    connections: connections.length,
    results: results.map((r) => ({
      connectionId: r.connectionId,
      hostId: r.hostId,
      outcome: r.outcome,
    })),
  });
}

interface AuthOk {
  ok: true;
}

interface AuthFail {
  ok: false;
  error: string;
  status: number;
}

function authorize(request: Request): AuthOk | AuthFail {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed — a misconfigured deployment must not invoke the poll.
    return { ok: false, error: "CRON_SECRET not configured", status: 503 };
  }
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!timingSafeEqual(header, expected)) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }
  return { ok: true };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function buildConsoleLogger(): Logger {
  return (record: LogRecord) => {
    // Vercel surfaces console.log lines as `info` and console.error as `error`
    // in the function logs UI; we route by level.
    const target = record.level === "error" ? console.error : console.log;
    target(
      JSON.stringify({
        scope: "treasury.ebics.poll",
        ts: new Date().toISOString(),
        ...record,
      }),
    );
  };
}
