import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UidPruefFormular } from "@/components/at/UidPruefFormular";
import {
  atArticleJsonLd,
  atBreadcrumbJsonLd,
  atFaqJsonLd,
  getAtSeite,
  getAtSeiten,
  getAtSlugs,
  getVeroeffentlichteAtSeiten,
  istVeroeffentlicht,
  mehrAusDemMagazin,
  registrierungsLink,
  renderAbschnitte,
} from "@/lib/at-ratgeber";

// KIN-6527 — Ratgeberseite Österreich aus content/at/<slug>.md. Der Platzhalter
// {{UID_PRUEFFORMULAR}} im Text wird durch das Prüf-Formular ersetzt.
// KIN-6649 — Teil des Magazins: Brotkrumen, Article-/BreadcrumbList-Schema,
// „Mehr aus dem Magazin“ und Orange-Octo-Kasten am Ende.

type Params = { slug: string };

// Veröffentlichte Seiten werden beim Bau vorgerendert; Entwürfe werden bei
// AT_RATGEBER_ENTWUERFE=1 auf Anfrage gerendert, sonst 404.
export const dynamicParams = true;
// KIN-6649 — stündlich neu erzeugen: Seiten mit publishedAt = heute erscheinen
// ohne neuen Bau (zusätzlich schaltet der 06:00-Cron sie sofort frei).
export const revalidate = 3600;

export async function generateStaticParams(): Promise<Params[]> {
  const seiten = await getVeroeffentlichteAtSeiten();
  return seiten.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const seite = await getAtSeite(slug);
  if (!seite) return {};
  return {
    title: seite.title,
    description: seite.metaDescription,
    alternates: { canonical: `/at/${seite.slug}` },
    robots: istVeroeffentlicht(seite)
      ? undefined
      : { index: false, follow: false },
    openGraph: {
      type: "article",
      title: seite.title,
      description: seite.metaDescription,
      url: `/at/${seite.slug}`,
      locale: "de_AT",
      ...(seite.publishedAt ? { publishedTime: seite.publishedAt } : {}),
      ...(seite.updatedAt ? { modifiedTime: seite.updatedAt } : {}),
    },
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("de-AT", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

export default async function AtRatgeberPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const seite = await getAtSeite(slug);
  if (!seite) notFound();

  const abschnitte = renderAbschnitte(seite.body, {
    bekannteSlugs: await getAtSlugs(),
  });
  const live = istVeroeffentlicht(seite);
  const mehr = mehrAusDemMagazin(seite, await getAtSeiten());
  const stand = seite.updatedAt ?? seite.publishedAt;
  const jsonLds = [
    atBreadcrumbJsonLd(seite),
    atArticleJsonLd(seite),
    atFaqJsonLd(seite),
  ].filter(Boolean);

  return (
    <article className="text-[var(--text-secondary)] leading-relaxed">
      {jsonLds.map((j, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(j) }}
        />
      ))}
      <nav aria-label="Brotkrumen" className="mb-4 text-xs">
        <ol className="flex flex-wrap items-center gap-1 list-none m-0 p-0">
          <li>
            <Link
              href="/at/magazin"
              className="text-[var(--brand-orange)] hover:underline"
            >
              Magazin
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <Link
              href={`/at/magazin#${seite.rubrik.slug}`}
              className="text-[var(--brand-orange)] hover:underline"
            >
              {seite.rubrik.name}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="text-[var(--text-secondary)]">
            {seite.h1}
          </li>
        </ol>
      </nav>
      <div className="prose-legal">
        {!live && (
          <p className="not-prose mb-4 rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {seite.publishedAt
              ? `Geplant für ${formatDate(seite.publishedAt)} — bis dahin nur in der Vorschau sichtbar.`
              : "Entwurf — nur in der Vorschau sichtbar."}
          </p>
        )}
        <h1>{seite.h1}</h1>
        <div className="text-xs text-[var(--text-secondary)] opacity-70 mb-6 flex items-center gap-2">
          <span>Orange Octo Magazin</span>
          {stand && <span>·</span>}
          {stand && (
            <span>
              Stand: <time dateTime={stand}>{formatDate(stand)}</time>
            </span>
          )}
        </div>
        {abschnitte.map((a, i) =>
          a.art === "html" ? (
            <div key={i} dangerouslySetInnerHTML={{ __html: a.html }} />
          ) : (
            <UidPruefFormular key={i} />
          ),
        )}
      </div>

      {mehr.length > 0 && (
        <section className="mt-10" aria-labelledby="mehr-aus-dem-magazin">
          <h2
            id="mehr-aus-dem-magazin"
            className="text-lg font-semibold text-[var(--text-primary)] mb-3"
          >
            Mehr aus dem Magazin
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {mehr.map((s) => (
              <li
                key={s.slug}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <p className="text-[11px] uppercase tracking-wide opacity-70">
                  {s.rubrik.name}
                </p>
                <Link
                  href={`/at/${s.slug}`}
                  className="mt-1 block text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--brand-orange)]"
                >
                  {s.h1}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <aside className="mt-10 rounded-xl border border-[var(--brand-orange)]/40 bg-[var(--brand-orange)]/10 p-5">
        <p className="text-base font-semibold text-[var(--text-primary)]">
          Rechnung mit allen Pflichtangaben in 2 Minuten
        </p>
        <p className="mt-1 text-sm">
          Orange Octo ist das Rechnungsprogramm hinter diesem Magazin. Damit
          schreibst du Rechnungen mit allen Pflichtangaben für Österreich.
        </p>
        <Link
          href={registrierungsLink(seite.slug)}
          className="mt-3 inline-block rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Kostenlos testen
        </Link>
      </aside>
    </article>
  );
}
