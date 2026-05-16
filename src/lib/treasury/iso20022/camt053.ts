// ORA-2283 — CAMT.053 (BankToCustomerStatement) parser.
//
// Scope: Phase 0+1 manual upload. Handles the common subset across CAMT.053
// versions .02–.08 — namespace-agnostic regex extraction, matching the
// pragmatic style used by `lib/einvoice/parser.ts` (no new XML dependency
// for a single Phase-1 surface; a library decision belongs in the
// EBICS-library PoC ticket, not this scaffolding PR).
//
// Returns a strongly typed `ParsedCamt053` with one statement's metadata +
// every booked Ntry as a `ParsedCamtTransaction`. Signs are explicit: the
// `direction` field is CRDT/DBIT, and `closing_balance` is signed (DBIT
// balances → negative). The upload route stores both the parsed rows AND
// the raw XML for audit, fingerprinted with a SHA-256 hash.

import type { ParsedCamt053, ParsedCamtTransaction, TransactionDirection } from "../types";

// Matches `<Stmt>…</Stmt>` (with or without namespace prefix). CAMT.053 can
// in principle contain multiple <Stmt> blocks (one per account); we expose
// the first one — multi-statement support is a Phase-3 concern when EBICS
// polling lands and a single download may bundle several accounts.
const STMT_BLOCK_RE = /<(?:[a-zA-Z_][\w.-]*:)?Stmt\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?Stmt>/;

const BAL_BLOCK_RE = /<(?:[a-zA-Z_][\w.-]*:)?Bal\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?Bal>/g;

const NTRY_BLOCK_RE = /<(?:[a-zA-Z_][\w.-]*:)?Ntry\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?Ntry>/g;

export class Camt053ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Camt053ParseError";
  }
}

export function parseCamt053(xml: string): ParsedCamt053 {
  if (!xml || typeof xml !== "string") {
    throw new Camt053ParseError("Empty CAMT.053 payload");
  }
  const stmt = matchInner(xml, STMT_BLOCK_RE);
  if (!stmt) throw new Camt053ParseError("Kein <Stmt>-Block gefunden");

  const iban = extractTag(stmt, "IBAN");
  if (!iban) throw new Camt053ParseError("IBAN fehlt in <Acct>");

  // BIC is optional in CAMT.053 (some banks omit it); we accept null.
  const bic = extractTag(stmt, "BICFI") ?? extractTag(stmt, "BIC");

  // Bank name lives under <Acct><Svcr><FinInstnId><Nm>. Many banks omit it
  // and only emit BICFI — accept null. Persisted into
  // treasury_bank_accounts.bank_name so the UI can show a human-readable
  // institution rather than the BIC code.
  const finInstn = matchInner(
    stmt,
    /<(?:[a-zA-Z_][\w.-]*:)?FinInstnId\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?FinInstnId>/,
  );
  const bankName = finInstn ? extractTag(finInstn, "Nm") : null;

  // Account currency: prefer <Acct><Ccy>, fall back to first balance's Ccy attr.
  const acctBlock = matchInner(stmt, /<(?:[a-zA-Z_][\w.-]*:)?Acct\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?Acct>/);
  const accountCurrency = (acctBlock && extractTag(acctBlock, "Ccy")) ?? "";

  // Statement date — prefer <CreDtTm>, else the closing balance's date.
  const creDtTm = extractTag(stmt, "CreDtTm") ?? "";
  let statementDate = creDtTm ? creDtTm.slice(0, 10) : "";

  // Balances: walk every <Bal> and pick opening (OPBD/PRCD) + closing (CLBD/CLAV).
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  let balanceCurrency: string | null = null;

  for (const balBlock of iterateBlocks(stmt, BAL_BLOCK_RE)) {
    const code = extractTag(balBlock, "Cd");
    const { amount, currency, direction } = extractAmount(balBlock);
    const signed = direction === "DBIT" ? -amount : amount;
    if (code === "OPBD" || code === "PRCD" || code === "OPAV") {
      openingBalance = signed;
      balanceCurrency = currency;
    } else if (code === "CLBD" || code === "CLAV") {
      closingBalance = signed;
      balanceCurrency = currency;
      if (!statementDate) {
        const balDate = extractDate(balBlock, "Dt");
        if (balDate) statementDate = balDate;
      }
    }
  }

  if (openingBalance === null) throw new Camt053ParseError("Opening-Balance (OPBD/PRCD) fehlt");
  if (closingBalance === null) throw new Camt053ParseError("Closing-Balance (CLBD/CLAV) fehlt");
  if (!statementDate) throw new Camt053ParseError("Statement-Date konnte nicht ermittelt werden");

  const currency = accountCurrency || balanceCurrency || "EUR";

  const transactions: ParsedCamtTransaction[] = [];
  for (const ntry of iterateBlocks(stmt, NTRY_BLOCK_RE)) {
    transactions.push(parseEntry(ntry, currency));
  }

  return {
    iban: iban.replace(/\s+/g, ""),
    bic: bic ? bic.trim() : null,
    bankName: bankName ? bankName.trim() : null,
    currency,
    statementDate,
    openingBalance,
    closingBalance,
    transactions,
  };
}

function parseEntry(ntry: string, fallbackCurrency: string): ParsedCamtTransaction {
  const { amount, currency, direction } = extractAmount(ntry);
  const bookingDate = extractDate(ntry, "BookgDt");
  const valueDate = extractDate(ntry, "ValDt");

  // BkTxCd block can be deeply nested; we collapse it to the proprietary code
  // when present, else the domain/family code, else null.
  const bkTxCdBlock = matchInner(ntry, /<(?:[a-zA-Z_][\w.-]*:)?BkTxCd\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?BkTxCd>/);
  const bankTransactionCode = bkTxCdBlock ? collapseBankTransactionCode(bkTxCdBlock) : null;

  // Counterparty: for CRDT entries the debtor is the counterparty; for DBIT
  // the creditor is. CAMT.053 puts them under <NtryDtls><TxDtls><RltdPties>.
  const partyBlock = matchInner(ntry, /<(?:[a-zA-Z_][\w.-]*:)?RltdPties\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?RltdPties>/);
  let counterpartyName: string | null = null;
  let counterpartyIban: string | null = null;
  let counterpartyBic: string | null = null;
  if (partyBlock) {
    const tag = direction === "CRDT" ? "Dbtr" : "Cdtr";
    const acctTag = direction === "CRDT" ? "DbtrAcct" : "CdtrAcct";
    const partyRe = new RegExp(`<(?:[a-zA-Z_][\\w.-]*:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z_][\\w.-]*:)?${tag}>`);
    const inner = matchInner(partyBlock, partyRe);
    if (inner) counterpartyName = extractTag(inner, "Nm");
    const acctRe = new RegExp(`<(?:[a-zA-Z_][\\w.-]*:)?${acctTag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z_][\\w.-]*:)?${acctTag}>`);
    const acctInner = matchInner(partyBlock, acctRe);
    if (acctInner) counterpartyIban = (extractTag(acctInner, "IBAN") ?? "").replace(/\s+/g, "") || null;
  }
  // BIC may sit under <RltdAgts><DbtrAgt|CdtrAgt><FinInstnId><BICFI>
  const rltdAgts = matchInner(ntry, /<(?:[a-zA-Z_][\w.-]*:)?RltdAgts\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z_][\w.-]*:)?RltdAgts>/);
  if (rltdAgts) counterpartyBic = extractTag(rltdAgts, "BICFI") ?? extractTag(rltdAgts, "BIC");

  const remittanceInfo = extractTag(ntry, "Ustrd");
  const endToEndId = extractTag(ntry, "EndToEndId");

  return {
    amount,
    currency: currency || fallbackCurrency,
    direction,
    bookingDate,
    valueDate,
    counterpartyName,
    counterpartyIban,
    counterpartyBic,
    remittanceInfo,
    endToEndId,
    bankTransactionCode,
  };
}

function extractAmount(block: string): { amount: number; currency: string; direction: TransactionDirection } {
  const amtMatch = block.match(/<(?:[a-zA-Z_][\w.-]*:)?Amt\b[^>]*Ccy="([A-Z]{3})"[^>]*>([\d.,-]+)<\/(?:[a-zA-Z_][\w.-]*:)?Amt>/);
  const amount = amtMatch ? Number(amtMatch[2]) : 0;
  const currency = amtMatch ? amtMatch[1] : "";
  const cdtDbt = extractTag(block, "CdtDbtInd");
  const direction: TransactionDirection = cdtDbt === "DBIT" ? "DBIT" : "CRDT";
  return { amount, currency, direction };
}

function collapseBankTransactionCode(block: string): string | null {
  const prop = extractTag(block, "Prtry");
  if (prop) {
    const code = extractTag(prop, "Cd");
    if (code) return code;
  }
  const domn = extractTag(block, "Domn");
  if (domn) {
    const code = extractTag(domn, "Cd");
    if (code) return code;
  }
  return null;
}

// CAMT.053 dates are wrapped: `<BookgDt><Dt>YYYY-MM-DD</Dt></BookgDt>` for
// pure dates and `<BookgDt><DtTm>YYYY-MM-DDThh:mm:ss</DtTm></BookgDt>` when the
// bank includes a time component. extractTag on its own returns the wrapper
// contents (`<Dt>2026-05-16</Dt>`), which then poisons Postgres `date`
// inserts. This helper peels the inner Dt/DtTm before slicing to `YYYY-MM-DD`.
function extractDate(xml: string, tag: string): string | null {
  const wrapper = extractTag(xml, tag);
  if (!wrapper) return null;
  const inner = extractTag(wrapper, "Dt") ?? extractTag(wrapper, "DtTm") ?? wrapper;
  const iso = inner.trim().slice(0, 10);
  return iso || null;
}

function extractTag(xml: string, tag: string): string | null {
  // Tries namespaced + bare; tag is matched literally with optional ns prefix.
  const re = new RegExp(`<(?:[a-zA-Z_][\\w.-]*:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z_][\\w.-]*:)?${tag}>`);
  const match = xml.match(re);
  if (!match) return null;
  const inner = match[1].trim();
  // For composite elements (containing children) we still return the trimmed
  // inner; callers that need text-only strip via shape.
  return inner;
}

function matchInner(xml: string, re: RegExp): string | null {
  const match = xml.match(re);
  return match ? match[1] : null;
}

function* iterateBlocks(xml: string, re: RegExp): Generator<string> {
  // Global regexes are stateful; clone via new RegExp to keep the iterator
  // re-entrant when the parser is called concurrently.
  const local = new RegExp(re.source, re.flags);
  let m: RegExpExecArray | null;
  while ((m = local.exec(xml)) !== null) {
    yield m[1];
  }
}
