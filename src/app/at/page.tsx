import type { Metadata } from "next";
import Link from "next/link";
import { getAtSeiten } from "@/lib/at-ratgeber";

// KIN-6527 — Übersicht der Ratgeberseiten Österreich.
export const metadata: Metadata = {
  title: "Ratgeber für Unternehmer in Österreich",
  description:
    "Rechnung, UID, Honorarnote, E-Rechnung und Registrierkasse: Ratgeber für Selbstständige und kleine Firmen in Österreich, mit Quellen und Datum.",
  alternates: { canonical: "/at" },
};

export default async function AtIndexPage() {
  const seiten = await getAtSeiten();
  return (
    <div className="prose-legal text-[var(--text-secondary)] leading-relaxed">
      <h1>Ratgeber für Unternehmer in Österreich</h1>
      <p>
        Kurz, mit Quellen und Datum: Was auf eine Rechnung gehört, wie du eine UID prüfst und was für E-Rechnung
        und Registrierkasse gilt.
      </p>
      {seiten.length === 0 ? (
        <p>Die ersten Ratgeber erscheinen in Kürze.</p>
      ) : (
        <ul className="not-prose grid gap-3 list-none m-0 p-0">
          {seiten.map((s) => (
            <li key={s.slug} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <Link href={`/at/${s.slug}`} className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand-orange)]">
                {s.h1}
                {s.publishedAt == null && <span className="ml-2 text-xs font-normal text-amber-600">(Entwurf)</span>}
              </Link>
              {(s.excerpt || s.metaDescription) && (
                <p className="mt-1 text-sm">{s.excerpt || s.metaDescription}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
