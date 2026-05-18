// ORA-2308 — Step 2 / Subscriber-Bootstrap: drive the sidecar INI + HIA
// rounds. Returns the new setup_status so the wizard advances.

import { NextResponse } from "next/server";
import { adminGate } from "../_lib/admin-gate";
import { EbicsSetupError, runIniHiaBootstrap } from "@/lib/treasury/ebics";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await adminGate();
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  let body: { connectionId?: string };
  try {
    body = (await request.json()) as { connectionId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Body ist kein gültiges JSON" }, { status: 400 });
  }
  if (typeof body.connectionId !== "string" || body.connectionId.length === 0) {
    return NextResponse.json({ ok: false, error: "connectionId fehlt" }, { status: 400 });
  }

  try {
    const row = await runIniHiaBootstrap(ctx.service, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      connectionId: body.connectionId,
    });
    return NextResponse.json({ ok: true, connection: row });
  } catch (err) {
    if (err instanceof EbicsSetupError) {
      return NextResponse.json({ ok: false, error: err.message, stage: err.stage }, { status: 502 });
    }
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
