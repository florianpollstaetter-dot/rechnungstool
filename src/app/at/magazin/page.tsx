import type { Metadata } from "next";
import Link from "next/link";
import { getAtSeiten, istVeroeffentlicht, RUBRIKEN } from "@/lib/at-ratgeber";

// KIN-6649 — Magazin-Startseite: alle veröffentlichten Ratgeber nach Rubrik.
// Leere Rubriken werden ausgeblendet. Stündlich neu erzeugt, damit Seiten mit
// publishedAt = heute ohne neuen Bau erscheinen.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Orange Octo Magazin: Rechnung und Steuern in Österreich",
  description:
    "Ratgeber für Selbstständige in Österreich: Rechnungen schreiben, Steuern und Abgaben, Vorlagen und Rechner. Mit Quellen und Stand-Datum, von Orange Octo.",
  alternates: { canonical: "/at/magazin" },
};

export default async function MagazinPage() {
  const seiten = await getAtSeiten();
  const rubriken = RUBRIKEN.map((r) => ({
    ...r,
    seiten: seiten.filter((s) => s.rubrik.slug === r.slug),
  })).filter((r) => r.seiten.length > 0);

  return (
    <div className="text-[var(--text-secondary)] leading-relaxed">
      <div className="prose-legal">
        <h1>Orange Octo Magazin</h1>
        <p>
          Rechnung, Umsatzsteuer, Registrierkasse und Steuern für Selbstständige
          und kleine Firmen in Österreich — kurz, mit Quellen und Stand-Datum.
          Das Magazin kommt von Orange Octo, einem Rechnungsprogramm für
          Österreich.
        </p>
      </div>
      {rubriken.length === 0 ? (
        <p className="mt-4">Die ersten Artikel erscheinen in Kürze.</p>
      ) : (
        <>
          <nav
            aria-label="Rubriken"
            className="my-6 flex flex-wrap gap-2 text-xs"
          >
            {rubriken.map((r) => (
              <a
                key={r.slug}
                href={`#${r.slug}`}
                className="rounded-full border border-[var(--border)] px-3 py-1 hover:border-[var(--brand-orange)] hover:text-[var(--brand-orange)]"
              >
                {r.name}
              </a>
            ))}
          </nav>
          {rubriken.map((r) => (
            <section key={r.slug} id={r.slug} className="scroll-mt-20 mt-8">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
                {r.name}
              </h2>
              <ul className="grid gap-3">
                {r.seiten.map((s) => (
                  <li
                    key={s.slug}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
                  >
                    <Link
                      href={`/at/${s.slug}`}
                      className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand-orange)]"
                    >
                      {s.h1}
                      {!istVeroeffentlicht(s) && (
                        <span className="ml-2 text-xs font-normal text-amber-600">
                          (Entwurf)
                        </span>
                      )}
                    </Link>
                    {(s.excerpt || s.metaDescription) && (
                      <p className="mt-1 text-sm">
                        {s.excerpt || s.metaDescription}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
