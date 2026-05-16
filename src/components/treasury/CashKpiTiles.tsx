"use client";

// ORA-2283 — KPI tiles for the Treasury overview page. Phase 0+1 shows the
// totals derived from imported CAMT.053 statements; Phase 4 (Forecast) will
// extend with a "next 4 weeks net cash" tile.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateLong } from "@/lib/format";
import type { TreasuryStatement } from "@/lib/treasury/types";

interface KpiState {
  accountCount: number;
  totals: Array<[string, number]>;
  latestStatementDate: string | null;
  loading: boolean;
}

export default function CashKpiTiles() {
  const { t } = useI18n();
  const [state, setState] = useState<KpiState>({
    accountCount: 0,
    totals: [],
    latestStatementDate: null,
    loading: true,
  });

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("treasury_bank_accounts").select("id", { count: "exact", head: true }),
      supabase
        .from("treasury_statements")
        .select("account_id, currency, closing_balance, statement_date")
        .order("statement_date", { ascending: false })
        .limit(100),
    ]).then(([accRes, stmtRes]) => {
      const statements = (stmtRes.data ?? []) as Pick<TreasuryStatement, "account_id" | "currency" | "closing_balance" | "statement_date">[];
      const latestPerAccount = new Map<string, typeof statements[number]>();
      for (const s of statements) {
        const existing = latestPerAccount.get(s.account_id);
        if (!existing || s.statement_date > existing.statement_date) latestPerAccount.set(s.account_id, s);
      }
      const totals = new Map<string, number>();
      for (const s of latestPerAccount.values()) {
        totals.set(s.currency, (totals.get(s.currency) ?? 0) + Number(s.closing_balance));
      }
      setState({
        accountCount: accRes.count ?? 0,
        totals: Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b)),
        latestStatementDate: statements[0]?.statement_date ?? null,
        loading: false,
      });
    });
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Tile label={t("treasury.cash.totalBalance")}>
        {state.totals.length === 0 ? (
          <p className="text-lg text-[var(--text-secondary)]">—</p>
        ) : (
          state.totals.map(([currency, amount]) => (
            <p key={currency} className="text-lg font-semibold text-[var(--text-primary)]">
              {formatCurrency(amount)} {currency}
            </p>
          ))
        )}
      </Tile>
      <Tile label={t("treasury.cash.accountCount")}>
        <p className="text-2xl font-semibold text-[var(--text-primary)]">{state.accountCount}</p>
      </Tile>
      <Tile label={t("treasury.cash.latestStatement")}>
        <p className="text-lg text-[var(--text-primary)]">
          {state.latestStatementDate ? formatDateLong(state.latestStatementDate) : "—"}
        </p>
      </Tile>
      <Link
        href="/treasury/cash"
        className="sm:col-span-3 rounded-lg border border-dashed border-[var(--border)] p-3 text-center text-sm text-[var(--brand-orange)] hover:bg-[var(--brand-orange-dim)]"
      >
        → {t("treasury.cash.uploadCamt")}
      </Link>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}
