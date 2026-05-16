// ORA-2283 — Treasury-specific Playwright fixtures.
//
// Wraps the shared qa-perms tenant provisioner with two Treasury extensions:
//   1. Flip company_subscriptions.has_treasury for the tenant under test.
//   2. Build a deterministic CAMT.053 fixture (one statement, two entries) so
//      the upload-route test doesn't depend on an external file.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

function service(): SupabaseClient {
  const env = loadEnv();
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function setTreasuryFlag(companyId: string, enabled: boolean): Promise<void> {
  const svc = service();
  const { error } = await svc
    .from("company_subscriptions")
    .upsert(
      {
        company_id: companyId,
        has_octo: true,
        has_treasury: enabled,
        treasury_tier: enabled ? "starter" : null,
      },
      { onConflict: "company_id" },
    );
  if (error) throw new Error(`setTreasuryFlag(${companyId}, ${enabled}) failed: ${error.message}`);
}

export async function cleanupTreasuryFor(companyId: string): Promise<void> {
  const svc = service();
  // FK cascades from companies → company_subscriptions and from
  // treasury_bank_accounts → treasury_statements + transactions.
  // Explicit deletes here keep the helper safe to call even when the tenant
  // tear-down skipped a step (test crash mid-run).
  await svc.from("treasury_transactions").delete().eq("company_id", companyId);
  await svc.from("treasury_statements").delete().eq("company_id", companyId);
  await svc.from("treasury_bank_accounts").delete().eq("company_id", companyId);
  await svc.from("treasury_entities").delete().eq("company_id", companyId);
  await svc.from("company_subscriptions").delete().eq("company_id", companyId);
}

/**
 * Builds a minimal CAMT.053.001.08 XML payload with one statement, one
 * opening + one closing balance, and two transactions (one CRDT, one DBIT).
 * The IBAN is parameterised so tests can prove tenant isolation by re-using
 * the same fixture across two companies without collisions.
 */
export function buildCamt053Fixture(opts: {
  iban: string;
  bic?: string;
  statementDate: string;
  opening: number;
  closing: number;
}): string {
  const { iban, bic = "TESTDEFFXXX", statementDate, opening, closing } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Id>STMT-${statementDate}-${iban.slice(-4)}</Id>
      <CreDtTm>${statementDate}T08:00:00</CreDtTm>
      <Acct>
        <Id><IBAN>${iban}</IBAN></Id>
        <Ccy>EUR</Ccy>
        <Svcr><FinInstnId><BICFI>${bic}</BICFI></FinInstnId></Svcr>
      </Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">${opening.toFixed(2)}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>${statementDate}</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">${closing.toFixed(2)}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>${statementDate}</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">125.50</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>${statementDate}</Dt></BookgDt>
        <ValDt><Dt>${statementDate}</Dt></ValDt>
        <BkTxCd><Prtry><Cd>NTRF</Cd></Prtry></BkTxCd>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-CRDT-001</EndToEndId></Refs>
            <RltdPties>
              <Dbtr><Nm>Acme Customer GmbH</Nm></Dbtr>
              <DbtrAcct><Id><IBAN>AT611904300234573201</IBAN></Id></DbtrAcct>
            </RltdPties>
            <RmtInf><Ustrd>Rechnung 2026-001</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">42.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>${statementDate}</Dt></BookgDt>
        <ValDt><Dt>${statementDate}</Dt></ValDt>
        <BkTxCd><Prtry><Cd>NDDT</Cd></Prtry></BkTxCd>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-DBIT-001</EndToEndId></Refs>
            <RltdPties>
              <Cdtr><Nm>Supplier AG</Nm></Cdtr>
              <CdtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></CdtrAcct>
            </RltdPties>
            <RmtInf><Ustrd>Materialeinkauf</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
}
