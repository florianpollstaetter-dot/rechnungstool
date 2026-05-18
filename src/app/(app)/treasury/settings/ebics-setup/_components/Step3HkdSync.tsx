"use client";

// ORA-2308 — Wizard Step 3: HPB + HKD round-trip after the bank releases
// the subscriber. Lists the authorised order types we got back from HKD.

import { useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import type { TreasuryBankConnection } from "@/lib/treasury/types";

interface Props {
  connection: TreasuryBankConnection | null;
  onCompleted: (connection: TreasuryBankConnection) => void;
  onError: (msg: string) => void;
}

export default function Step3HkdSync({ connection, onCompleted, onError }: Props) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<TreasuryBankConnection | null>(connection);

  async function runSync() {
    if (!current || running) return;
    setRunning(true);
    try {
      const response = await fetch("/api/treasury/ebics/setup/hkd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: current.id }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        connection?: TreasuryBankConnection;
        error?: string;
      };
      if (!response.ok || !body.ok || !body.connection) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      setCurrent(body.connection);
    } catch (err) {
      onError(t("treasury.settings.ebicsSetup.error", { reason: err instanceof Error ? err.message : String(err) }));
    } finally {
      setRunning(false);
    }
  }

  if (!current) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        {t("treasury.settings.ebicsSetup.step1.intro")}
      </p>
    );
  }

  const synced = current.last_hpb_at !== null;

  return (
    <section className="flex flex-col gap-4 border border-[var(--border)] rounded-lg p-5 bg-[var(--surface)]">
      <header>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("treasury.settings.ebicsSetup.step3.title")}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {t("treasury.settings.ebicsSetup.step3.intro")}
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={runSync}
          disabled={running}
          className="bg-[var(--brand-orange)] text-black px-4 py-2 rounded-md text-sm font-semibold hover:brightness-110 disabled:opacity-50"
        >
          {running ? "…" : t("treasury.settings.ebicsSetup.step3.runCta")}
        </button>
      </div>

      {synced ? (
        <div className="flex flex-col gap-2 border border-emerald-500/40 bg-emerald-500/5 rounded-md p-4">
          <h3 className="text-sm font-semibold text-emerald-300">
            {t("treasury.settings.ebicsSetup.step3.orderTypes")}
          </h3>
          {current.order_types.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              {t("treasury.settings.ebicsSetup.step3.noOrderTypes")}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {current.order_types.map((ot) => (
                <li
                  key={ot}
                  className="px-2 py-1 bg-[var(--surface-hover)] border border-[var(--border)] rounded-md text-xs font-mono"
                >
                  {ot}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onCompleted(current)}
              className="bg-[var(--brand-orange)] text-black px-4 py-2 rounded-md text-sm font-semibold hover:brightness-110"
            >
              →
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
