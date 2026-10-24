"use client";

// KIN-6650 — gemeinsame Bausteine der Rechner auf /at/… (Rahmen, Eingabefeld,
// Ergebniszeilen, Produkthinweis). Gestaltung wie das UID-Prüf-Formular.
// Alle Rechner rechnen im Browser; es wird nichts gesendet oder gespeichert.

import type { ReactNode } from "react";

export const EINGABE_KLASSE =
  "w-full min-h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] aria-[invalid=true]:border-red-500";

export function RechnerRahmen({
  id,
  titel,
  hinweis,
  testId,
  children,
}: {
  id: string;
  titel: string;
  hinweis: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-titel`}
      className="not-prose my-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6"
      data-testid={testId}
    >
      <h2 id={`${id}-titel`} className="text-lg font-semibold text-[var(--text-primary)] mb-1">
        {titel}
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-4">{hinweis}</p>
      {children}
    </section>
  );
}

export function Feld({
  id,
  label,
  einheit,
  children,
  hilfe,
}: {
  id: string;
  label: string;
  einheit?: string;
  hilfe?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--text-primary)] mb-1">
        {label}
        {einheit && <span className="font-normal text-[var(--text-muted)]"> ({einheit})</span>}
      </label>
      {children}
      {hilfe && <p className="mt-1 text-xs text-[var(--text-muted)]">{hilfe}</p>}
    </div>
  );
}

export function ErgebnisListe({ children }: { children: ReactNode }) {
  return (
    <dl className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm">
      {children}
    </dl>
  );
}

export function ErgebnisZeile({ label, wert, stark }: { label: string; wert: string; stark?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-2">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd
        className={
          stark
            ? "text-base font-semibold text-[var(--text-primary)] tabular-nums text-right"
            : "text-[var(--text-primary)] tabular-nums text-right"
        }
      >
        {wert}
      </dd>
    </div>
  );
}

export function FehlerText({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} role="alert" className="text-sm text-red-600 dark:text-red-400">
      {text}
    </p>
  );
}

export function Kleingedrucktes({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">{children}</p>;
}

export function Quelle({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-[var(--brand-orange)]">
      {children}
    </a>
  );
}

/** Ruhiger Übergang zum Produkt unter dem Ergebnis. */
export function ProduktHinweis({ text, utmInhalt }: { text: string; utmInhalt: string }) {
  return (
    <p className="mt-4 rounded-lg bg-[var(--brand-orange-dim)] px-3 py-2 text-sm text-[var(--text-primary)]">
      {text}{" "}
      <a
        href={`/register?utm_source=magazin&utm_medium=rechner&utm_campaign=${encodeURIComponent(utmInhalt)}`}
        className="font-semibold underline text-[var(--brand-orange)]"
      >
        Orange Octo kostenlos testen
      </a>
    </p>
  );
}
