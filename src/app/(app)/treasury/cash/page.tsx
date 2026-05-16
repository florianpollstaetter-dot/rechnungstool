"use client";

// ORA-2283 — Cash visibility dashboard.
//
// Phase 0+1 (this PR): manual CAMT.053 upload + read-only balances + recent
// transactions. EBICS polling lands in Phase 3.

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateLong } from "@/lib/format";
import type { TreasuryBankAccount, TreasuryStatement, TreasuryTransaction } from "@/lib/treasury/types";

interface CashState {
  accounts: TreasuryBankAccount[];
  statements: TreasuryStatement[];
  transactions: TreasuryTransaction[];
  loading: boolean;
}

export default function TreasuryCashPage() {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CashState>({
    accounts: [],
    statements: [],
    transactions: [],
    loading: true,
  });
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [accountsRes, statementsRes, transactionsRes] = await Promise.all([
      supabase.from("treasury_bank_accounts").select("*").order("created_at", { ascending: false }),
      supabase.from("treasury_statements").select("*").order("statement_date", { ascending: false }).limit(50),
      supabase.from("treasury_transactions").select("*").order("booking_date", { ascending: false }).limit(25),
    ]);
    setState({
      accounts: (accountsRes.data ?? []) as TreasuryBankAccount[],
      statements: (statementsRes.data ?? []) as TreasuryStatement[],
      transactions: (transactionsRes.data ?? []) as TreasuryTransaction[],
      loading: false,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFeedback(null);
    try {
      const xml = await file.text();
      const response = await fetch("/api/treasury/statements/upload", {
        method: "POST",
        headers: { "content-type": "application/xml" },
        body: xml,
      });
      const body = (await response.json()) as { ok?: boolean; transactions?: number; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      setFeedback({
        kind: "success",
        message: t("treasury.cash.uploadSuccess", { count: body.transactions ?? 0 }),
      });
      await refresh();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setFeedback({ kind: "error", message: t("treasury.cash.uploadError", { reason }) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const totalsByCurrency = aggregateLatestClosingBalances(state.statements);
  const latestStatementDate = state.statements[0]?.statement_date ?? null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("treasury.cash.title")}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{t("treasury.cash.uploadHint")}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{t("treasury.cash.totalBalance")}</p>
          {totalsByCurrency.length === 0 ? (
            <p className="mt-2 text-lg text-[var(--text-secondary)]">—</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {totalsByCurrency.map(([currency, amount]) => (
                <li key={currency} className="text-lg font-semibold text-[var(--text-primary)]">
                  {formatCurrency(amount)} {currency}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{t("treasury.cash.accountCount")}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{state.accounts.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{t("treasury.cash.latestStatement")}</p>
          <p className="mt-2 text-lg text-[var(--text-primary)]">
            {latestStatementDate ? formatDateLong(latestStatementDate) : "—"}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("treasury.cash.uploadCamt")}</h2>
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              onChange={handleUpload}
              disabled={uploading}
              data-testid="treasury-camt-upload"
              className="text-sm"
            />
          </div>
        </div>
        {feedback && (
          <p
            className={
              feedback.kind === "success"
                ? "text-sm text-emerald-500"
                : "text-sm text-rose-500"
            }
            role="status"
          >
            {feedback.message}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("treasury.cash.lastTransactions")}</h2>
        {state.transactions.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("treasury.cash.noStatements")}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--text-muted)]">
              <tr>
                <th className="py-1 pr-2">Datum</th>
                <th className="py-1 pr-2">Gegenpartei</th>
                <th className="py-1 pr-2">Verwendungszweck</th>
                <th className="py-1 pr-2 text-right">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {state.transactions.map((tx) => (
                <tr key={tx.id} className="border-t border-[var(--border)]">
                  <td className="py-1.5 pr-2 text-[var(--text-secondary)]">
                    {tx.booking_date ? formatDateLong(tx.booking_date) : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-[var(--text-primary)]">{tx.counterparty_name ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-[var(--text-secondary)] truncate max-w-xs">
                    {tx.remittance_info ?? ""}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    <span className={tx.direction === "DBIT" ? "text-rose-500" : "text-emerald-500"}>
                      {tx.direction === "DBIT" ? "-" : "+"}
                      {formatCurrency(tx.amount)} {tx.currency}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// Sums the most recent closing balance per account, grouped by currency.
function aggregateLatestClosingBalances(statements: TreasuryStatement[]): Array<[string, number]> {
  const latestPerAccount = new Map<string, TreasuryStatement>();
  for (const stmt of statements) {
    const existing = latestPerAccount.get(stmt.account_id);
    if (!existing || stmt.statement_date > existing.statement_date) {
      latestPerAccount.set(stmt.account_id, stmt);
    }
  }
  const totals = new Map<string, number>();
  for (const stmt of latestPerAccount.values()) {
    totals.set(stmt.currency, (totals.get(stmt.currency) ?? 0) + Number(stmt.closing_balance));
  }
  return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b));
}
