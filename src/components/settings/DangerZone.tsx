"use client";

// SCH-963 K3-AG1 — Tenant self-service Danger Zone (admin-only).
// Two destructive flows that backend-mirror SCH-962's operator-side variants:
//   1. Pause  → POST /api/companies/[id]/pause   (3-step modal)
//   2. Delete → DELETE /api/companies/[id]      (5-step modal + 5 s cooldown)
// Both call sign-out after success: pausing locks the user out (suspended),
// deleting wipes the membership row, so staying on the page would just hit
// BlockedCompanyGate.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/lib/company-context";

type FlowState = "idle" | "pause" | "delete";

interface DeleteCounts {
  invoices: number;
  quotes: number;
  receipts: number;
  projects: number;
  members: number;
  customers: number;
}

const REQUIRED_DELETE_WORD = "LÖSCHEN";
const DELETE_COOLDOWN_SECONDS = 5;

export default function DangerZone() {
  const { company } = useCompany();
  const router = useRouter();
  const [flow, setFlow] = useState<FlowState>("idle");

  if (!company?.id) return null;

  return (
    <section className="mb-6 bg-[var(--surface)] rounded-xl border-2 border-rose-500/40 p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="text-rose-500 text-2xl leading-none">⚠️</span>
        <div>
          <h2 className="text-lg font-semibold text-rose-400">Gefährlicher Bereich</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Diese Aktionen betreffen das gesamte Unternehmen und sind nur für Administrator:innen
            sichtbar. Bitte sorgfältig lesen — die Folgen sind weitreichend bzw. unwiderruflich.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <div className="border border-[var(--border)] rounded-lg p-4 flex flex-col">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            Unternehmen ruhend stellen
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-3 flex-1">
            Sperrt den Login für alle Mitarbeiter:innen. Daten bleiben erhalten. Reaktivierung nur
            durch unseren Support.
          </p>
          <button
            type="button"
            onClick={() => setFlow("pause")}
            className="self-start px-4 py-2 text-sm font-medium text-amber-100 bg-amber-600/80 hover:bg-amber-600 rounded-lg transition-colors"
          >
            Ruhend stellen
          </button>
        </div>

        <div className="border border-rose-500/40 rounded-lg p-4 flex flex-col">
          <h3 className="text-sm font-semibold text-rose-400 mb-1">Unternehmen löschen</h3>
          <p className="text-xs text-[var(--text-secondary)] mb-3 flex-1">
            Löscht ALLE Daten dieses Unternehmens unwiderruflich (Rechnungen, Belege, Projekte,
            Zeiten, Mitarbeiter, …). Aufbewahrungspflichten beachten.
          </p>
          <button
            type="button"
            onClick={() => setFlow("delete")}
            className="self-start px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
          >
            Endgültig löschen
          </button>
        </div>
      </div>

      {flow === "pause" && (
        <PauseFlow
          companyId={company.id}
          companyName={company.name}
          onClose={() => setFlow("idle")}
          router={router}
        />
      )}
      {flow === "delete" && (
        <DeleteFlow
          companyId={company.id}
          companyName={company.name}
          onClose={() => setFlow("idle")}
          router={router}
        />
      )}
    </section>
  );
}

interface FlowProps {
  companyId: string;
  companyName: string;
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
}

// ---------------------------------------------------------------------------
// Pause flow — 3 steps: warning → confirm name + checkbox → final button
// ---------------------------------------------------------------------------

function PauseFlow({ companyId, companyName, onClose, router }: FlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nameInput, setNameInput] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatches = nameInput.trim() === companyName;

  async function handlePause() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_name: nameInput.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Fehler ${res.status}`);
      }
      // Sign out — the next reload would otherwise hit BlockedCompanyGate.
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login?paused=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={busy ? undefined : onClose} title="Unternehmen ruhend stellen" tone="amber">
      {step === 1 && (
        <>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4 text-sm text-amber-200 leading-relaxed">
            <p className="font-semibold mb-2">⚠️ Sobald du dein Unternehmen ruhend stellst:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Können sich alle Mitarbeiter:innen NICHT mehr einloggen</li>
              <li>Aktive Sessions werden beim nächsten Reload beendet</li>
              <li>Daten bleiben vollständig erhalten</li>
              <li>Reaktivierung ist nur über unseren Support möglich</li>
            </ul>
          </div>
          <ModalFooter>
            <SecondaryButton onClick={onClose}>Abbrechen</SecondaryButton>
            <PrimaryButton tone="amber" onClick={() => setStep(2)}>
              Weiter
            </PrimaryButton>
          </ModalFooter>
        </>
      )}

      {step === 2 && (
        <>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Tippe den Firmennamen exakt ein, um zu bestätigen:
          </p>
          <p className="text-sm font-mono bg-[var(--background)] border border-[var(--border)] rounded px-3 py-2 mb-3 text-[var(--text-primary)]">
            {companyName}
          </p>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            autoFocus
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-amber-500 mb-3"
            placeholder="Firmenname"
          />
          <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            <span>Mir ist bewusst, dass alle Mitarbeiter:innen ausgeloggt werden.</span>
          </label>
          <ModalFooter>
            <SecondaryButton onClick={onClose}>Abbrechen</SecondaryButton>
            <PrimaryButton
              tone="amber"
              onClick={() => setStep(3)}
              disabled={!nameMatches || !acknowledged}
            >
              Weiter
            </PrimaryButton>
          </ModalFooter>
        </>
      )}

      {step === 3 && (
        <>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Letzte Bestätigung: <strong className="text-[var(--text-primary)]">{companyName}</strong>{" "}
            wird sofort gesperrt. Du wirst automatisch ausgeloggt.
          </p>
          {error && (
            <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 mb-3">
              {error}
            </p>
          )}
          <ModalFooter>
            <SecondaryButton onClick={onClose} disabled={busy}>
              Abbrechen
            </SecondaryButton>
            <PrimaryButton tone="amber" onClick={handlePause} disabled={busy}>
              {busy ? "Wird gesperrt …" : "Unternehmen jetzt ruhend stellen"}
            </PrimaryButton>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Delete flow — 5 steps: warning+counts → checkboxes → name → word → final
// ---------------------------------------------------------------------------

function DeleteFlow({ companyId, companyName, onClose, router }: FlowProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [counts, setCounts] = useState<DeleteCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [exported, setExported] = useState(false);
  const [understandsIrreversible, setUnderstandsIrreversible] = useState(false);
  const [retentionChecked, setRetentionChecked] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [wordInput, setWordInput] = useState("");
  const [cooldown, setCooldown] = useState(DELETE_COOLDOWN_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatches = nameInput.trim() === companyName;
  const wordMatches = wordInput.trim() === REQUIRED_DELETE_WORD;
  const allCheckboxesChecked = exported && understandsIrreversible && retentionChecked;

  // Step 5: 5-second cooldown before final delete is enabled.
  useEffect(() => {
    if (step !== 5) return;
    setCooldown(DELETE_COOLDOWN_SECONDS);
    const interval = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // Load counts on mount via direct supabase queries (admin has RLS access).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const tables = [
          "invoices",
          "quotes",
          "receipts",
          "projects",
          "company_members",
          "customers",
        ] as const;
        const results = await Promise.all(
          tables.map((t) =>
            supabase.from(t).select("*", { count: "exact", head: true }).eq("company_id", companyId),
          ),
        );
        if (cancelled) return;
        setCounts({
          invoices: results[0].count ?? 0,
          quotes: results[1].count ?? 0,
          receipts: results[2].count ?? 0,
          projects: results[3].count ?? 0,
          members: results[4].count ?? 0,
          customers: results[5].count ?? 0,
        });
      } catch {
        if (!cancelled) setCounts({ invoices: 0, quotes: 0, receipts: 0, projects: 0, members: 0, customers: 0 });
      } finally {
        if (!cancelled) setCountsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm_name: nameInput.trim(),
          confirm_word: wordInput.trim(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Fehler ${res.status}`);
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login?deleted=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={busy ? undefined : onClose} title="Unternehmen unwiderruflich löschen" tone="rose">
      <StepBadge current={step} total={5} />

      {step === 1 && (
        <>
          <div className="bg-rose-500/10 border-2 border-rose-500/40 rounded-lg p-4 mb-4 text-sm text-rose-200 leading-relaxed">
            <p className="font-semibold mb-2">🚨 ACHTUNG — UNWIDERRUFLICH!</p>
            <p className="mb-2">Dies löscht für immer:</p>
            {countsLoading || !counts ? (
              <p className="text-xs italic">Datenmengen werden geladen …</p>
            ) : (
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                <li>Alle Rechnungen ({counts.invoices})</li>
                <li>Alle Angebote ({counts.quotes})</li>
                <li>Alle Belege ({counts.receipts})</li>
                <li>Alle Projekte ({counts.projects})</li>
                <li>Alle Zeiterfassungs-Daten</li>
                <li>Alle Kunden ({counts.customers})</li>
                <li>Alle Mitarbeiter-Konten ({counts.members})</li>
                <li>Logo, Designs, Einstellungen</li>
              </ul>
            )}
            <p className="mt-3 text-xs">
              <strong>Finanzbuchhaltung-relevante Daten</strong> (Rechnungen!) müssen ggf. extern
              gesichert werden — Aufbewahrungspflicht 7 Jahre.
            </p>
          </div>
          <ModalFooter>
            <SecondaryButton onClick={onClose}>Abbrechen</SecondaryButton>
            <PrimaryButton tone="rose" onClick={() => setStep(2)} disabled={countsLoading}>
              Verstanden — weiter
            </PrimaryButton>
          </ModalFooter>
        </>
      )}

      {step === 2 && (
        <>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Bitte bestätige jeden Punkt einzeln:
          </p>
          <div className="space-y-2 mb-4">
            <CheckboxRow checked={exported} onChange={setExported}>
              Ich habe alle wichtigen Daten exportiert.
            </CheckboxRow>
            <CheckboxRow checked={understandsIrreversible} onChange={setUnderstandsIrreversible}>
              Ich verstehe, dass diese Aktion unwiderruflich ist.
            </CheckboxRow>
            <CheckboxRow checked={retentionChecked} onChange={setRetentionChecked}>
              Ich habe gesetzliche Aufbewahrungspflichten geprüft.
            </CheckboxRow>
          </div>
          <ModalFooter>
            <SecondaryButton onClick={onClose}>Abbrechen</SecondaryButton>
            <PrimaryButton tone="rose" onClick={() => setStep(3)} disabled={!allCheckboxesChecked}>
              Weiter
            </PrimaryButton>
          </ModalFooter>
        </>
      )}

      {step === 3 && (
        <>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Tippe den Firmennamen exakt ein:
          </p>
          <p className="text-sm font-mono bg-[var(--background)] border border-[var(--border)] rounded px-3 py-2 mb-3 text-[var(--text-primary)]">
            {companyName}
          </p>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            autoFocus
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500 mb-3"
            placeholder="Firmenname"
          />
          <ModalFooter>
            <SecondaryButton onClick={onClose}>Abbrechen</SecondaryButton>
            <PrimaryButton tone="rose" onClick={() => setStep(4)} disabled={!nameMatches}>
              Weiter
            </PrimaryButton>
          </ModalFooter>
        </>
      )}

      {step === 4 && (
        <>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Tippe das Wort{" "}
            <strong className="text-rose-400 font-mono">{REQUIRED_DELETE_WORD}</strong> in
            Großbuchstaben ein:
          </p>
          <input
            type="text"
            value={wordInput}
            onChange={(e) => setWordInput(e.target.value)}
            autoFocus
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-rose-500 mb-3"
            placeholder={REQUIRED_DELETE_WORD}
          />
          <ModalFooter>
            <SecondaryButton onClick={onClose}>Abbrechen</SecondaryButton>
            <PrimaryButton tone="rose" onClick={() => setStep(5)} disabled={!wordMatches}>
              Weiter
            </PrimaryButton>
          </ModalFooter>
        </>
      )}

      {step === 5 && (
        <>
          <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 mb-4">
            Letzter Schritt: <strong>{companyName}</strong> wird in wenigen Sekunden permanent
            gelöscht. Du wirst danach automatisch ausgeloggt. Es gibt kein Zurück.
          </p>
          {error && (
            <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 mb-3">
              {error}
            </p>
          )}
          <ModalFooter>
            <SecondaryButton onClick={onClose} disabled={busy}>
              Abbrechen
            </SecondaryButton>
            <PrimaryButton tone="rose" onClick={handleDelete} disabled={busy || cooldown > 0}>
              {busy
                ? "Wird gelöscht …"
                : cooldown > 0
                  ? `Bitte warten … (${cooldown})`
                  : "Unternehmen unwiderruflich löschen"}
            </PrimaryButton>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tiny shared modal primitives
// ---------------------------------------------------------------------------

function Modal({
  title,
  tone,
  children,
  onClose,
}: {
  title: string;
  tone: "amber" | "rose";
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const ringClass = tone === "rose" ? "border-rose-500/40" : "border-amber-500/40";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-[var(--surface)] rounded-xl shadow-2xl border-2 ${ringClass} max-w-lg w-full p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-3 mt-2">{children}</div>;
}

function PrimaryButton({
  children,
  tone,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  tone: "amber" | "rose";
  onClick: () => void;
  disabled?: boolean;
}) {
  const colorClass =
    tone === "rose"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : "bg-amber-600 hover:bg-amber-500 text-amber-50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colorClass}`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function CheckboxRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>{children}</span>
    </label>
  );
}

function StepBadge({ current, total }: { current: number; total: number }) {
  return (
    <p className="text-xs text-[var(--text-muted)] mb-3">
      Schritt {current} / {total}
    </p>
  );
}
