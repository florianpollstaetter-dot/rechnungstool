"use client";

// ORA-2308 — Top-level client wizard. Owns the step state machine, the
// currently-persisted `TreasuryBankConnection`, and the cross-step error /
// status banner.
//
// Each step component is dumb: it receives the connection + callbacks and
// produces a "go to next" signal. State transitions happen here.

import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import type { TreasuryBankConnection } from "@/lib/treasury/types";
import Step1BankConnector from "./Step1BankConnector";
import Step2SubscriberBootstrap from "./Step2SubscriberBootstrap";
import Step3HkdSync from "./Step3HkdSync";
import Step4HevProbe from "./Step4HevProbe";

interface Props {
  initialConnection: TreasuryBankConnection | null;
}

export type WizardStep = 1 | 2 | 3 | 4;

function resumeStep(connection: TreasuryBankConnection | null): WizardStep {
  if (!connection) return 1;
  switch (connection.setup_status) {
    case "draft":
      return 2;
    case "init_sent":
    case "letters_pending":
      return 3;
    case "hpb_pending":
    case "hkd_pending":
      return 4;
    case "active":
      return 4;
    case "failed":
      // Failed setups resume at step 1 — admin reviews fields, retries.
      return 1;
    default:
      return 1;
  }
}

export default function EbicsSetupWizard({ initialConnection }: Props) {
  const { t } = useI18n();
  const [connection, setConnection] = useState<TreasuryBankConnection | null>(initialConnection);
  const [step, setStep] = useState<WizardStep>(resumeStep(initialConnection));
  const [error, setError] = useState<string | null>(null);

  const handleConnectionUpdate = useCallback((updated: TreasuryBankConnection) => {
    setConnection(updated);
  }, []);

  const advance = useCallback((next: WizardStep) => {
    setError(null);
    setStep(next);
  }, []);

  const stepLabel = useMemo(
    () => t("treasury.settings.ebicsSetup.stepLabel", { n: step }),
    [step, t],
  );

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          {t("treasury.settings.ebicsSetup.title")}
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {t("treasury.settings.ebicsSetup.subtitle")}
        </p>
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">{stepLabel}</p>
      </header>

      <WizardProgress current={step} />

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </div>
      ) : null}

      {step === 1 ? (
        <Step1BankConnector
          connection={connection}
          onSaved={(c) => {
            handleConnectionUpdate(c);
            advance(2);
          }}
          onError={setError}
        />
      ) : null}
      {step === 2 ? (
        <Step2SubscriberBootstrap
          connection={connection}
          onCompleted={(c) => {
            handleConnectionUpdate(c);
            advance(3);
          }}
          onError={setError}
        />
      ) : null}
      {step === 3 ? (
        <Step3HkdSync
          connection={connection}
          onCompleted={(c) => {
            handleConnectionUpdate(c);
            advance(4);
          }}
          onError={setError}
        />
      ) : null}
      {step === 4 ? (
        <Step4HevProbe
          connection={connection}
          onCompleted={(c) => handleConnectionUpdate(c)}
          onError={setError}
        />
      ) : null}

      <nav className="flex justify-between text-xs text-[var(--text-muted)] mt-2">
        <button
          type="button"
          onClick={() => advance(((step - 1) || 1) as WizardStep)}
          disabled={step === 1}
          className="underline disabled:opacity-30 disabled:no-underline"
        >
          ←
        </button>
        <span>
          {connection?.updated_at
            ? t("treasury.settings.ebicsSetup.savedAt", {
                at: new Date(connection.updated_at).toLocaleString("de-AT"),
              })
            : ""}
        </span>
        <button
          type="button"
          onClick={() => advance(Math.min(4, step + 1) as WizardStep)}
          disabled={step === 4 || !connection}
          className="underline disabled:opacity-30 disabled:no-underline"
        >
          →
        </button>
      </nav>
    </div>
  );
}

function WizardProgress({ current }: { current: WizardStep }) {
  const { t } = useI18n();
  const items: { step: WizardStep; key: "step1" | "step2" | "step3" | "step4" }[] = [
    { step: 1, key: "step1" },
    { step: 2, key: "step2" },
    { step: 3, key: "step3" },
    { step: 4, key: "step4" },
  ];
  return (
    <ol
      aria-label="EBICS-Setup-Fortschritt"
      className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]"
    >
      {items.map(({ step, key }) => {
        const active = step === current;
        const done = step < current;
        return (
          <li
            key={step}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${
              active
                ? "border-[var(--brand-orange)] text-[var(--brand-orange)]"
                : done
                  ? "border-emerald-500/40 text-emerald-300"
                  : "border-[var(--border)] text-[var(--text-muted)]"
            }`}
          >
            <span className="font-mono text-[10px]">{step}</span>
            <span className="font-medium">
              {t(`treasury.settings.ebicsSetup.${key}.title` as const)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
