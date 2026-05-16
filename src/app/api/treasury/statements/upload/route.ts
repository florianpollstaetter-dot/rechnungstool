// ORA-2283 — Manual CAMT.053 upload endpoint.
//
// Phase 0+1 scope: accept a single CAMT.053 XML body, parse it, look up or
// auto-create the matching `treasury_bank_accounts` row (we provision a
// default `treasury_entities` row per company on first upload so the FK is
// satisfied), and insert one `treasury_statements` plus the corresponding
// `treasury_transactions`.
//
// EBICS polling lands in Phase 3 and will reuse the same insert path —
// only the source attribution changes (`source: 'ebics_poll'`).
//
// Middleware (`src/middleware.ts`) already gates this route on
// has_treasury=true; here we additionally enforce membership of the active
// company via service_role so the row we insert is provably scoped.

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";
import { parseCamt053, Camt053ParseError } from "@/lib/treasury/iso20022/camt053";
import type { ParsedCamt053 } from "@/lib/treasury/types";

export const runtime = "nodejs";

interface UploadOk {
  ok: true;
  statementId: string;
  accountId: string;
  transactions: number;
  duplicate: boolean;
}

interface UploadFail {
  ok: false;
  error: string;
}

export async function POST(request: Request): Promise<NextResponse<UploadOk | UploadFail>> {
  const ssr = await createServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Nicht authentifiziert" }, { status: 401 });
  }

  const service = createServiceClient();

  // Resolve active company from app_metadata; fall back to first membership.
  const appMeta = (user.app_metadata ?? {}) as { company_id?: string; active_company_id?: string };
  let companyId = appMeta.company_id ?? appMeta.active_company_id ?? null;
  if (!companyId) {
    const { data: member } = await service
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle<{ company_id: string }>();
    companyId = member?.company_id ?? null;
  }
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Keine aktive Company" }, { status: 400 });
  }

  let xml: string;
  try {
    xml = await request.text();
  } catch {
    return NextResponse.json({ ok: false, error: "Body unlesbar" }, { status: 400 });
  }
  if (!xml.trim()) {
    return NextResponse.json({ ok: false, error: "Leerer Upload" }, { status: 400 });
  }

  let parsed: ParsedCamt053;
  try {
    parsed = parseCamt053(xml);
  } catch (error) {
    const reason = error instanceof Camt053ParseError ? error.message : "Parse-Fehler";
    return NextResponse.json({ ok: false, error: reason }, { status: 400 });
  }

  const rawHash = createHash("sha256").update(xml).digest("hex");

  // Idempotency: same (company, raw_hash) → return the existing statement
  // without re-inserting. Cheap protection against repeated uploads.
  const { data: existing } = await service
    .from("treasury_statements")
    .select("id, account_id")
    .eq("company_id", companyId)
    .eq("raw_hash", rawHash)
    .maybeSingle<{ id: string; account_id: string }>();
  if (existing) {
    return NextResponse.json({
      ok: true,
      statementId: existing.id,
      accountId: existing.account_id,
      transactions: 0,
      duplicate: true,
    });
  }

  // Look up or create the bank account for this IBAN.
  const accountId = await ensureAccount(service, companyId, parsed);

  const { data: statementRow, error: stmtErr } = await service
    .from("treasury_statements")
    .insert({
      company_id: companyId,
      account_id: accountId,
      statement_date: parsed.statementDate,
      opening_balance: parsed.openingBalance,
      closing_balance: parsed.closingBalance,
      currency: parsed.currency,
      raw_camt: xml,
      raw_hash: rawHash,
      source: "manual_upload",
      uploaded_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (stmtErr || !statementRow) {
    return NextResponse.json(
      { ok: false, error: stmtErr?.message ?? "Statement-Insert fehlgeschlagen" },
      { status: 500 },
    );
  }

  if (parsed.transactions.length > 0) {
    const rows = parsed.transactions.map((tx) => ({
      company_id: companyId,
      statement_id: statementRow.id,
      account_id: accountId,
      booking_date: tx.bookingDate,
      value_date: tx.valueDate,
      amount: tx.amount,
      currency: tx.currency,
      direction: tx.direction,
      counterparty_name: tx.counterpartyName,
      counterparty_iban: tx.counterpartyIban,
      counterparty_bic: tx.counterpartyBic,
      remittance_info: tx.remittanceInfo,
      end_to_end_id: tx.endToEndId,
      bank_transaction_code: tx.bankTransactionCode,
    }));
    const { error: txErr } = await service.from("treasury_transactions").insert(rows);
    if (txErr) {
      // Statement is in; transactions failed. Phase 0 keeps it simple — log
      // and surface the error. A future migration adds a unique index across
      // (statement_id, end_to_end_id, booking_date, amount, direction) so a
      // retry can converge.
      return NextResponse.json(
        { ok: false, error: `Statement OK, Transaction-Insert fehlgeschlagen: ${txErr.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    statementId: statementRow.id,
    accountId,
    transactions: parsed.transactions.length,
    duplicate: false,
  });
}

async function ensureAccount(
  service: ReturnType<typeof createServiceClient>,
  companyId: string,
  parsed: ParsedCamt053,
): Promise<string> {
  const iban = parsed.iban;
  const existing = await service
    .from("treasury_bank_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("iban", iban)
    .maybeSingle<{ id: string }>();
  if (existing.data) return existing.data.id;

  const entityId = await ensureDefaultEntity(service, companyId);

  const inserted = await service
    .from("treasury_bank_accounts")
    .insert({
      company_id: companyId,
      entity_id: entityId,
      bank_bic: parsed.bic ?? "UNKNOWN",
      bank_name: parsed.bic ?? "Imported via CAMT.053",
      iban,
      currency: parsed.currency,
      status: "active",
    })
    .select("id")
    .single<{ id: string }>();
  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message ?? "Account-Insert fehlgeschlagen");
  }
  return inserted.data.id;
}

async function ensureDefaultEntity(
  service: ReturnType<typeof createServiceClient>,
  companyId: string,
): Promise<string> {
  const { data: company } = await service
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle<{ id: string; name: string }>();
  const legalName = company?.name ?? companyId;

  const existing = await service
    .from("treasury_entities")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existing.data) return existing.data.id;

  const inserted = await service
    .from("treasury_entities")
    .insert({
      company_id: companyId,
      legal_name: legalName,
      currency: "EUR",
    })
    .select("id")
    .single<{ id: string }>();
  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message ?? "Entity-Insert fehlgeschlagen");
  }
  return inserted.data.id;
}
