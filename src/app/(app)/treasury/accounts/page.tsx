"use client";

// ORA-2283 — Bank Account Management (BAM) list. Phase 0+1 ships the
// read-only listing seeded by manual CAMT.053 import (account row is
// created on first statement upload for that IBAN). Manual CRUD comes
// alongside EBICS-Setup in Phase 3.

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import { createClient } from "@/lib/supabase/client";
import type { TreasuryBankAccount } from "@/lib/treasury/types";

export default function TreasuryAccountsPage() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<TreasuryBankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("treasury_bank_accounts")
      .select("*")
      .order("bank_name", { ascending: true })
      .then(({ data }) => {
        setAccounts((data ?? []) as TreasuryBankAccount[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t("treasury.accounts.title")}</h1>
      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">{t("common.loading")}</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">{t("treasury.accounts.noAccounts")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[var(--text-muted)]">
            <tr>
              <th className="py-1 pr-2">Bank</th>
              <th className="py-1 pr-2">IBAN</th>
              <th className="py-1 pr-2">BIC</th>
              <th className="py-1 pr-2">Währung</th>
              <th className="py-1 pr-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-[var(--border)]">
                <td className="py-1.5 pr-2 text-[var(--text-primary)]">{a.bank_name}</td>
                <td className="py-1.5 pr-2 text-[var(--text-secondary)] font-mono">{a.iban}</td>
                <td className="py-1.5 pr-2 text-[var(--text-secondary)] font-mono">{a.bank_bic}</td>
                <td className="py-1.5 pr-2">{a.currency}</td>
                <td className="py-1.5 pr-2 text-[var(--text-secondary)]">{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
