// ORA-2308 — Step 1 / Bank-Connector: create or update the draft
// `treasury_bank_connection` from the wizard's first screen.

import { NextResponse } from "next/server";
import { adminGate } from "../_lib/admin-gate";
import { EbicsSetupError, upsertConnectionDraft, type BankConnectorInput } from "@/lib/treasury/ebics";

export const runtime = "nodejs";

function parseInput(raw: unknown): BankConnectorInput | string {
  if (typeof raw !== "object" || raw === null) return "Body fehlt";
  const r = raw as Record<string, unknown>;
  const preset = r.bank_preset;
  if (preset !== "erste" && preset !== "sparkasse" && preset !== "deutsche_bank" && preset !== "manual") {
    return "Ungültiger Bank-Preset";
  }
  const str = (k: string): string => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
  return {
    bank_preset: preset,
    bank_name: str("bank_name"),
    host_url: str("host_url"),
    host_id: str("host_id"),
    partner_id: str("partner_id"),
    user_id: str("user_id"),
    customer_id: str("customer_id"),
    system_id: typeof r.system_id === "string" && r.system_id.length > 0 ? r.system_id : null,
    ebics_version: r.ebics_version === "H004" ? "H004" : "H005",
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await adminGate();
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body ist kein gültiges JSON" }, { status: 400 });
  }
  const parsed = parseInput(body);
  if (typeof parsed === "string") {
    return NextResponse.json({ ok: false, error: parsed }, { status: 400 });
  }

  try {
    const row = await upsertConnectionDraft(ctx.service, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      input: parsed,
    });
    return NextResponse.json({ ok: true, connection: row });
  } catch (err) {
    if (err instanceof EbicsSetupError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
