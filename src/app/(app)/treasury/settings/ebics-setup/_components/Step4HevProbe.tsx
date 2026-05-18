"use client";

// ORA-2308 — Wizard Step 4: HEV probe + final activation. Refuses to flip
// to `active` unless the bank reports EBICS 3.0 (H005 / "EBICS 3.x").

import { useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import type { TreasuryBankConnection } from "@/lib/treasury/types";

interface Props {
  connection: TreasuryBankConnection | null;
  onCompleted: (connection: TreasuryBankConnection) => void;
  onError: (msg: string) => void;
}

export default function Step4HevProbe({ connection, onCompleted, onError }: Props) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<TreasuryBankConnection | null>(connection);

  async function runProbe() {
    if (!current || running) return;
    setRunning(true);
    try {
      const response = await fetch("/api/treasury/ebics/setup/hev", {
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
      onCompleted(body.connection);
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

  const isActive = current.setup_status === "active";

  return (
    <section className="flex flex-col gap-4 border border-[var(--border)] rounded-lg p-5 bg-[var(--surface)]">
      <header>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("treasury.settings.ebicsSetup.step4.title")}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {t("treasury.settings.ebicsSetup.step4.intro")}
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={runProbe}
          disabled={running}
          className="bg-[var(--brand-orange)] text-black px-4 py-2 rounded-md text-sm font-semibold hover:brightness-110 disabled:opacity-50"
        >
          {running ? "…" : t("treasury.settings.ebicsSetup.step4.runCta")}
        </button>
      </div>

      {isActive ? (
        <div className="flex flex-col gap-3 border border-emerald-500/40 bg-emerald-500/5 rounded-md p-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <h3 className="text-sm font-semibold text-emerald-300">
              {t("treasury.settings.ebicsSetup.step4.success")}
            </h3>
          </div>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <StatusCell
              label={t("treasury.settings.ebicsSetup.step4.versionLabel")}
              value={current.last_hev_version ?? "—"}
            />
            <StatusCell
              label={t("treasury.settings.ebicsSetup.step4.lastPollLabel")}
              value={current.last_poll_at ? new Date(current.last_poll_at).toLocaleString("de-AT") : "—"}
            />
            <StatusCell
              label={t("treasury.settings.ebicsSetup.step4.nextPollLabel")}
              value={
                current.next_poll_at
                  ? new Date(current.next_poll_at).toLocaleString("de-AT")
                  : t("treasury.settings.ebicsSetup.step4.notScheduled")
              }
            />
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function StatusCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">{label}</dt>
      <dd className="text-sm font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
