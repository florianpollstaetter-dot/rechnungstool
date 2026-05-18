"use client";

// ORA-2308 — Wizard Step 1: bank preset + EBICS subscriber details.
// Persists via POST /api/treasury/ebics/setup/connection.

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import type { EbicsBankPreset, TreasuryBankConnection } from "@/lib/treasury/types";
import { BANK_PRESETS } from "./presets";

interface Props {
  connection: TreasuryBankConnection | null;
  onSaved: (connection: TreasuryBankConnection) => void;
  onError: (msg: string) => void;
}

interface FormState {
  bank_preset: EbicsBankPreset;
  bank_name: string;
  host_url: string;
  host_id: string;
  partner_id: string;
  user_id: string;
  customer_id: string;
  system_id: string;
}

function initial(connection: TreasuryBankConnection | null): FormState {
  if (connection) {
    return {
      bank_preset: connection.bank_preset ?? "manual",
      bank_name: connection.bank_name ?? "",
      host_url: connection.host_url ?? "",
      host_id: connection.ebics_host_id,
      partner_id: connection.ebics_partner_id,
      user_id: connection.ebics_user_id,
      customer_id: connection.customer_id ?? "",
      system_id: connection.system_id ?? "",
    };
  }
  const preset = BANK_PRESETS[0];
  return {
    bank_preset: preset.preset,
    bank_name: preset.bankName,
    host_url: preset.hostUrl,
    host_id: preset.hostId,
    partner_id: "",
    user_id: "",
    customer_id: "",
    system_id: "",
  };
}

export default function Step1BankConnector({ connection, onSaved, onError }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(() => initial(connection));
  const [submitting, setSubmitting] = useState(false);

  const presetOptions = useMemo(
    () =>
      BANK_PRESETS.map((p) => ({
        value: p.preset,
        label: t(`treasury.settings.ebicsSetup.step1.preset.${p.preset}` as const),
      })),
    [t],
  );

  function applyPreset(preset: EbicsBankPreset) {
    const meta = BANK_PRESETS.find((p) => p.preset === preset);
    setForm((prev) => ({
      ...prev,
      bank_preset: preset,
      bank_name: meta?.bankName || prev.bank_name,
      host_url: meta?.hostUrl || prev.host_url,
      host_id: meta?.hostId || prev.host_id,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/treasury/ebics/setup/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          system_id: form.system_id.trim() === "" ? null : form.system_id,
        }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        connection?: TreasuryBankConnection;
        error?: string;
      };
      if (!response.ok || !body.ok || !body.connection) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      onSaved(body.connection);
    } catch (err) {
      onError(t("treasury.settings.ebicsSetup.error", { reason: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 border border-[var(--border)] rounded-lg p-5 bg-[var(--surface)]">
      <header>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {t("treasury.settings.ebicsSetup.step1.title")}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {t("treasury.settings.ebicsSetup.step1.intro")}
        </p>
      </header>

      <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleSubmit}>
        <Field label={t("treasury.settings.ebicsSetup.step1.preset")} htmlFor="bank_preset">
          <select
            id="bank_preset"
            value={form.bank_preset}
            onChange={(e) => applyPreset(e.target.value as EbicsBankPreset)}
            className={fieldClass}
          >
            {presetOptions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("treasury.settings.ebicsSetup.step1.bankName")} htmlFor="bank_name">
          <input
            id="bank_name"
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            required
            className={fieldClass}
          />
        </Field>
        <Field label={t("treasury.settings.ebicsSetup.step1.hostUrl")} htmlFor="host_url" full>
          <input
            id="host_url"
            value={form.host_url}
            onChange={(e) => setForm({ ...form, host_url: e.target.value })}
            type="url"
            required
            className={fieldClass}
          />
        </Field>
        <Field label={t("treasury.settings.ebicsSetup.step1.hostId")} htmlFor="host_id">
          <input
            id="host_id"
            value={form.host_id}
            onChange={(e) => setForm({ ...form, host_id: e.target.value })}
            required
            className={fieldClass}
          />
        </Field>
        <Field label={t("treasury.settings.ebicsSetup.step1.partnerId")} htmlFor="partner_id">
          <input
            id="partner_id"
            value={form.partner_id}
            onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
            required
            className={fieldClass}
          />
        </Field>
        <Field label={t("treasury.settings.ebicsSetup.step1.userId")} htmlFor="user_id">
          <input
            id="user_id"
            value={form.user_id}
            onChange={(e) => setForm({ ...form, user_id: e.target.value })}
            required
            className={fieldClass}
          />
        </Field>
        <Field label={t("treasury.settings.ebicsSetup.step1.customerId")} htmlFor="customer_id">
          <input
            id="customer_id"
            value={form.customer_id}
            onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
            required
            className={fieldClass}
          />
        </Field>
        <Field label={t("treasury.settings.ebicsSetup.step1.systemId")} htmlFor="system_id">
          <input
            id="system_id"
            value={form.system_id}
            onChange={(e) => setForm({ ...form, system_id: e.target.value })}
            className={fieldClass}
          />
        </Field>

        <div className="md:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="bg-[var(--brand-orange)] text-black px-4 py-2 rounded-md text-sm font-semibold hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? "…" : t("treasury.settings.ebicsSetup.step1.saveCta")}
          </button>
        </div>
      </form>
    </section>
  );
}

const fieldClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]";

function Field({
  label,
  htmlFor,
  children,
  full,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className={`flex flex-col gap-1 ${full ? "md:col-span-2" : ""}`}>
      <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

