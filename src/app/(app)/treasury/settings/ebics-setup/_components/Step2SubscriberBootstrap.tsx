"use client";

// ORA-2308 — Wizard Step 2: subscriber bootstrap (INI + HIA).
//
// Sends the sidecar `init` round-trip; once successful, the operator can
// download the two initialization letters as PDF and post them to the bank.
// `setup_status` transitions to `letters_pending`. Step 3 is unlocked only
// after the operator confirms the letters have been posted.

import { useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import type { TreasuryBankConnection } from "@/lib/treasury/types";

interface Props {
  connection: TreasuryBankConnection | null;
  onCompleted: (connection: TreasuryBankConnection) => void;
  onError: (msg: string) => void;
}

export default function Step2SubscriberBootstrap({ connection, onCompleted, onError }: Props) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [downloadingKind, setDownloadingKind] = useState<"ini" | "hia" | null>(null);
  const [current, setCurrent] = useState<TreasuryBankConnection | null>(connection);

  const lettersAvailable =
    current?.setup_status === "letters_pending" || current?.setup_status === "init_sent" ||
    current?.setup_status === "hpb_pending" || current?.setup_status === "hkd_pending" ||
    current?.setup_status === "active";

  async function runBootstrap() {
    if (!current || running) return;
    setRunning(true);
    try {
      const response = await fetch("/api/treasury/ebics/setup/init", {
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

  async function downloadLetter(kind: "ini" | "hia") {
    if (!current || downloadingKind) return;
    setDownloadingKind(kind);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { default: EbicsLetterPDF } = await import("@/components/treasury/EbicsLetterPDF");
      const blob = await pdf(
        <EbicsLetterPDF
          kind={kind}
          bankName={current.bank_name ?? ""}
          hostId={current.ebics_host_id}
          partnerId={current.ebics_partner_id}
          userId={current.ebics_user_id}
          customerId={current.customer_id ?? ""}
          systemId={current.system_id}
          ebicsVersion={current.ebics_version}
          subscriberName={current.bank_name ?? ""}
          generatedAt={(current.letters_generated_at ?? new Date().toISOString()).slice(0, 10)}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `EBICS_${kind.toUpperCase()}_${current.ebics_host_id}_${current.ebics_partner_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      onError(t("treasury.settings.ebicsSetup.error", { reason: err instanceof Error ? err.message : String(err) }));
    } finally {
      setDownloadingKind(null);
    }
  }

  function confirmAndAdvance() {
    if (!current) return;
    onCompleted(current);
  }

  if (!current) {
    return <EmptyConnection />;
  }

  return (
    <section className="flex flex-col gap-4 border border-[var(--border)] rounded-lg p-5 bg-[var(--surface)]">
      <header>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("treasury.settings.ebicsSetup.step2.title")}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {t("treasury.settings.ebicsSetup.step2.intro")}
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={runBootstrap}
          disabled={running || lettersAvailable}
          className="bg-[var(--brand-orange)] text-black px-4 py-2 rounded-md text-sm font-semibold hover:brightness-110 disabled:opacity-50"
        >
          {running ? "…" : t("treasury.settings.ebicsSetup.step2.runCta")}
        </button>
      </div>

      {lettersAvailable ? (
        <div className="flex flex-col gap-3 border border-emerald-500/40 bg-emerald-500/5 rounded-md p-4">
          <h3 className="text-sm font-semibold text-emerald-300">
            {t("treasury.settings.ebicsSetup.step2.lettersTitle")}
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            {t("treasury.settings.ebicsSetup.step2.lettersHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadLetter("ini")}
              disabled={downloadingKind !== null}
              className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)] px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {downloadingKind === "ini" ? "…" : t("treasury.settings.ebicsSetup.step2.iniLetterCta")}
            </button>
            <button
              type="button"
              onClick={() => downloadLetter("hia")}
              disabled={downloadingKind !== null}
              className="bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)] px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {downloadingKind === "hia" ? "…" : t("treasury.settings.ebicsSetup.step2.hiaLetterCta")}
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={confirmAndAdvance}
              className="bg-[var(--brand-orange)] text-black px-4 py-2 rounded-md text-sm font-semibold hover:brightness-110"
            >
              {t("treasury.settings.ebicsSetup.step2.continueCta")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EmptyConnection() {
  const { t } = useI18n();
  return (
    <p className="text-sm text-[var(--text-secondary)]">
      {t("treasury.settings.ebicsSetup.step1.intro")}
    </p>
  );
}
