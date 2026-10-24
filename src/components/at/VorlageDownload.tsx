// KIN-6650 — Download-Kasten für eine Vorlage, Baustein {{DOWNLOAD_<NAME>}} in content/at/*.md.
// Server-Komponente (kein JavaScript im Browser). Dateien kommen aus
// src/app/at/vorlagen/[datei]/route.ts.

import type { Vorlage } from "@/lib/at-vorlagen/vorlagen";

export function VorlageDownload({ vorlage }: { vorlage: Vorlage }) {
  const basis = `/at/vorlagen/${vorlage.datei}`;
  // `!`-Klassen: .prose-legal a färbt Links sonst orange und unterstreicht sie.
  const knopf =
    "!no-underline inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--brand-orange)] sm:flex-none";
  return (
    <section
      className="not-prose my-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6"
      data-testid={`vorlage-download-${vorlage.datei}`}
    >
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{vorlage.titel} kostenlos herunterladen</h3>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        {vorlage.beschreibung}. Word zum Bearbeiten, PDF zum Ausfüllen am Handy oder Computer. Ohne Anmeldung.
      </p>
      <div className="flex flex-wrap gap-3">
        <a href={`${basis}.docx`} download className={`${knopf} bg-[var(--brand-orange)] !text-white hover:opacity-90`}>
          Word (.docx)
        </a>
        <a
          href={`${basis}.pdf`}
          target="_blank"
          rel="noopener"
          className={`${knopf} border border-[var(--brand-orange)] !text-[var(--brand-orange)] hover:bg-[var(--brand-orange-dim)]`}
        >
          PDF zum Ausfüllen
        </a>
      </div>
      <p className="mt-4 rounded-lg bg-[var(--brand-orange-dim)] px-3 py-2 text-sm text-[var(--text-primary)]">
        {vorlage.produktHinweis}{" "}
        <a
          href={`/register?utm_source=magazin&utm_medium=vorlage&utm_campaign=${encodeURIComponent(vorlage.datei)}`}
          className="font-semibold underline text-[var(--brand-orange)]"
        >
          Orange Octo kostenlos testen
        </a>
      </p>
    </section>
  );
}
