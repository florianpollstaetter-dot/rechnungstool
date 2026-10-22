import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UidPruefFormular } from "@/components/at/UidPruefFormular";
import { atFaqJsonLd, getAtSeite, getVeroeffentlichteAtSeiten, renderAbschnitte } from "@/lib/at-ratgeber";

// KIN-6527 — Ratgeberseite Österreich aus content/at/<slug>.md. Der Platzhalter
// {{UID_PRUEFFORMULAR}} im Text wird durch das Prüf-Formular ersetzt.

type Params = { slug: string };

// Veröffentlichte Seiten werden beim Bau vorgerendert; Entwürfe werden bei
// AT_RATGEBER_ENTWUERFE=1 auf Anfrage gerendert, sonst 404.
export const dynamicParams = true;

export async function generateStaticParams(): Promise<Params[]> {
  const seiten = await getVeroeffentlichteAtSeiten();
  return seiten.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const seite = await getAtSeite(slug);
  if (!seite) return {};
  return {
    title: seite.title,
    description: seite.metaDescription,
    alternates: { canonical: `/at/${seite.slug}` },
    robots: seite.publishedAt == null ? { index: false, follow: false } : undefined,
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
    : d.toLocaleDateString("de-AT", { year: "numeric", month: "long", day: "numeric" });
}

export default async function AtRatgeberPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const seite = await getAtSeite(slug);
  if (!seite) notFound();

  const abschnitte = renderAbschnitte(seite.body);
  const jsonLd = atFaqJsonLd(seite);

  return (
    <article className="prose-legal text-[var(--text-secondary)] leading-relaxed">
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <div className="not-prose mb-4">
        <Link href="/at" className="text-xs text-[var(--brand-orange)] hover:underline">
          ← Alle Ratgeber
        </Link>
      </div>
      {seite.publishedAt == null && (
        <p className="not-prose mb-4 rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Entwurf — nur in der Vorschau sichtbar.
        </p>
      )}
      <h1>{seite.h1}</h1>
      <div className="text-xs text-[var(--text-secondary)] opacity-70 mb-6 flex items-center gap-2">
        {seite.category && <span>{seite.category}</span>}
        {seite.category && seite.updatedAt && <span>·</span>}
        {seite.updatedAt && (
          <span>
            Stand: <time dateTime={seite.updatedAt}>{formatDate(seite.updatedAt)}</time>
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
    </article>
  );
}
