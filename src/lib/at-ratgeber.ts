// KIN-6527 — Ratgeberseiten Österreich unter /at/<slug>.
//
// Inhalte liegen als Markdown in content/at/<slug>.md (Front-Matter wie beim
// Blog, siehe content/blog/README.md). Zusätzlich darf im Text der Platzhalter
//   {{UID_PRUEFFORMULAR}}
// stehen — src/app/at/[slug]/page.tsx setzt dort das UID-Prüf-Formular ein.
// Dafür wird der Text in Abschnitte zerlegt: HTML-Stücke und Bausteine.
//
// Entwürfe (publishedAt: null) sind nur sichtbar, wenn AT_RATGEBER_ENTWUERFE=1
// gesetzt ist (lokale Vorschau, E2E-Tests). Im Produktivbetrieb → 404.
//
// KIN-6649 — Magazin: Seiten mit publishedAt in der Zukunft gelten bis zu diesem
// Tag (Kalendertag in Wien) als Entwurf: 404, nicht in Sitemap und Magazin. Die
// Seiten werden stündlich neu erzeugt (revalidate), der Cron
// /api/cron/magazin-freischaltung schaltet sie um 06:00 sofort frei und meldet
// sie per IndexNow.
//
// Server-only (fs). Alle veröffentlichten Seiten werden beim Bau vorgerendert.

import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import sanitizeHtmlLib, { type IOptions } from "sanitize-html";
import { extractFaqs, type FaqEntry } from "@/lib/blog";

const AT_DIR = path.join(process.cwd(), "content", "at");

export const BAUSTEINE = ["UID_PRUEFFORMULAR"] as const;
export type Baustein = (typeof BAUSTEINE)[number];

// KIN-6532 — Textbausteine: Platzhalter, die im Fließtext durch einen String
// ersetzt werden (kein eigener Abschnitt). null = Wert noch nicht bekannt →
// der Platzhalter entfällt; steht er allein in runden Klammern, entfällt die
// Klammer mit („der Gründer ist Jurist ({{GRUENDER_NAME}}).“ → „… Jurist.“).
//
// Name des Gründers für den Vertrauensanker auf allen /at/-Seiten. Sobald er
// vom Board kommt, hier eintragen — alle Seiten übernehmen ihn beim nächsten Bau.
export const GRUENDER_NAME: string | null = null;

export const TEXTBAUSTEINE: Readonly<Record<string, string | null>> = {
  GRUENDER_NAME,
};

// KIN-6649 — Rubriken des Magazins in Anzeigereihenfolge. Front-Matter-Feld
// `rubrik`; fehlt es, wird es aus `category` abgeleitet (rubrikAus).
export const RUBRIKEN = [
  { slug: "rechnungen-schreiben", name: "Rechnungen schreiben" },
  { slug: "steuern-und-abgaben", name: "Steuern und Abgaben" },
  { slug: "vorlagen-und-rechner", name: "Vorlagen und Rechner" },
  { slug: "rechnungsprogramme-im-vergleich", name: "Rechnungsprogramme im Vergleich" },
] as const;
export type Rubrik = (typeof RUBRIKEN)[number];

const STEUER_KATEGORIEN = /steuer|abgabe|registrierkasse|sozialversicherung|svs/i;

export function rubrikAus(rubrik: string | null, category: string | null): Rubrik {
  const r = rubrik?.trim().toLowerCase();
  const treffer = r ? RUBRIKEN.find((x) => x.name.toLowerCase() === r || x.slug === r) : undefined;
  if (treffer) return treffer;
  return category && STEUER_KATEGORIEN.test(category) ? RUBRIKEN[1] : RUBRIKEN[0];
}

/** Heutiges Datum in Wien als YYYY-MM-DD (Freischaltung erfolgt nach österreichischem Kalendertag). */
export function heuteInWien(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(jetzt);
}

/** Live = publishedAt gesetzt und nicht in der Zukunft (Wiener Kalendertag). */
export function istVeroeffentlicht(s: Pick<AtSeite, "publishedAt">, heute: string = heuteInWien()): boolean {
  return s.publishedAt != null && s.publishedAt.slice(0, 10) <= heute;
}

export type AtSeite = {
  slug: string;
  title: string;
  h1: string;
  metaDescription: string;
  publishedAt: string | null;
  updatedAt: string | null;
  category: string | null;
  rubrik: Rubrik;
  excerpt: string;
  faqSchema: boolean;
  body: string;
};

export type Abschnitt = { art: "html"; html: string } | { art: "baustein"; name: Baustein };

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function normalizeDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && v !== "null" && v.length > 0) return v;
  return null;
}

function entwuerfeSichtbar(): boolean {
  return process.env.AT_RATGEBER_ENTWUERFE === "1";
}

async function readAll(): Promise<AtSeite[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(AT_DIR);
  } catch {
    return [];
  }
  const files = entries.filter((f) => f.endsWith(".md") && f !== "README.md");
  return Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(AT_DIR, file), "utf8");
      const { data, content } = matter(raw);
      const d = data as Record<string, unknown>;
      const slug = str(d.slug) ?? file.replace(/\.md$/, "");
      const schema = d.schema;
      const faqSchema =
        schema === true ||
        schema === "FAQPage" ||
        (typeof schema === "object" && schema !== null && (schema as { type?: unknown }).type === "FAQPage") ||
        d.faq_schema === true;
      return {
        slug,
        title: str(d.title) ?? slug,
        h1: str(d.h1) ?? str(d.title) ?? slug,
        metaDescription: str(d.metaDescription) ?? str(d.meta) ?? str(d.excerpt) ?? "",
        publishedAt: normalizeDate(d.publishedAt),
        updatedAt: normalizeDate(d.updatedAt) ?? normalizeDate(d.stand),
        category: str(d.category),
        rubrik: rubrikAus(str(d.rubrik), str(d.category)),
        excerpt: str(d.excerpt) ?? "",
        faqSchema,
        body: content,
      };
    }),
  );
}

function sichtbar(s: AtSeite): boolean {
  return istVeroeffentlicht(s) || entwuerfeSichtbar();
}

/** Veröffentlichte Seiten (plus Entwürfe bei AT_RATGEBER_ENTWUERFE=1), neueste zuerst. */
export async function getAtSeiten(): Promise<AtSeite[]> {
  const all = await readAll();
  return all
    .filter(sichtbar)
    .sort((a, b) => (b.updatedAt ?? b.publishedAt ?? "").localeCompare(a.updatedAt ?? a.publishedAt ?? ""));
}

/** Nur wirklich veröffentlichte Seiten — für Sitemap und Vorrendern. */
export async function getVeroeffentlichteAtSeiten(): Promise<AtSeite[]> {
  const all = await readAll();
  const heute = heuteInWien();
  return all.filter((s) => istVeroeffentlicht(s, heute));
}

/** Seiten, die heute (Wiener Kalendertag) erscheinen — für den Freischalt-Cron. */
export async function getHeuteErscheinendeAtSeiten(heute: string = heuteInWien()): Promise<AtSeite[]> {
  const all = await readAll();
  return all.filter((s) => s.publishedAt?.slice(0, 10) === heute);
}

/** Bis zu `anzahl` andere Seiten, zuerst aus derselben Rubrik, dann die übrigen (neueste zuerst). */
export function mehrAusDemMagazin(seite: AtSeite, alle: AtSeite[], anzahl = 3): AtSeite[] {
  const andere = alle.filter((s) => s.slug !== seite.slug);
  const gleich = andere.filter((s) => s.rubrik.slug === seite.rubrik.slug);
  const rest = andere.filter((s) => s.rubrik.slug !== seite.rubrik.slug);
  return [...gleich, ...rest].slice(0, anzahl);
}

/** Slugs aller Seiten (auch Entwürfe) — für das Entschärfen von Links auf noch nicht existierende Seiten. */
export async function getAtSlugs(): Promise<Set<string>> {
  const all = await readAll();
  return new Set(all.map((s) => s.slug));
}

export async function getAtSeite(slug: string): Promise<AtSeite | null> {
  const all = await readAll();
  const s = all.find((x) => x.slug === slug);
  return s && sichtbar(s) ? s : null;
}

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "strong", "em", "b", "i", "u", "s", "del", "ins",
  "blockquote",
  "code", "pre", "kbd", "samp",
  "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "span", "div",
];

const SANITIZE: IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["class", "id"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? "";
      const isExternal = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: isExternal ? { ...attribs, target: "_blank", rel: "noopener noreferrer" } : attribs,
      };
    },
  },
};

const PLATZHALTER_RE = /\{\{\s*([A-Z_]+)\s*\}\}/g;

export interface RenderOptionen {
  /** Slugs, die es unter /at/ gibt. Links auf andere /at/-Seiten werden zu Text, damit keine 404-Links live gehen. */
  bekannteSlugs?: Set<string>;
  /** Textbausteine ({{GRUENDER_NAME}} …); Standard: TEXTBAUSTEINE. */
  textbausteine?: Readonly<Record<string, string | null>>;
}

/**
 * Ersetzt Textbausteine im Markdown. Unbekannte Werte (null) entfallen samt
 * umschließender Klammer: „Jurist ({{GRUENDER_NAME}}).“ → „Jurist.“
 */
export function ersetzeTextbausteine(
  text: string,
  bausteine: Readonly<Record<string, string | null>> = TEXTBAUSTEINE,
): string {
  let out = text;
  for (const [name, wert] of Object.entries(bausteine)) {
    const re = new RegExp(String.raw`[ \t]*\(\s*\{\{\s*${name}\s*\}\}\s*\)|\{\{\s*${name}\s*\}\}`, "g");
    out = out.replace(re, (m) => {
      if (wert == null || wert.trim() === "") return "";
      return m.trimStart().startsWith("(") ? ` (${wert.trim()})` : wert.trim();
    });
  }
  return out;
}

/**
 * Zerlegt den Markdown-Text an Bausteinen ({{UID_PRUEFFORMULAR}}) und rendert
 * die Textstücke zu bereinigtem HTML.
 * - Die erste H1 im Text entfällt (die Seite setzt die H1 aus dem Front-Matter).
 * - Textbausteine ({{GRUENDER_NAME}}) werden im Fließtext ersetzt, siehe ersetzeTextbausteine.
 * - Unbekannte Platzhalter ({{GFB_RECHNER}}, {{DOWNLOAD_…}}) werden entfernt,
 *   nicht als Text ausgegeben — sie stehen für Bausteine, die noch fehlen.
 * - Links auf /at/<slug>, die es noch nicht gibt, werden zu reinem Text.
 */
export function renderAbschnitte(body: string, opt: RenderOptionen = {}): Abschnitt[] {
  const ohneH1 = ersetzeTextbausteine(body.replace(/^\s*# .+\n/, ""), opt.textbausteine);
  const abschnitte: Abschnitt[] = [];
  let letzte = 0;
  for (const m of ohneH1.matchAll(PLATZHALTER_RE)) {
    const name = m[1];
    const text = ohneH1.slice(letzte, m.index);
    if (text.trim()) abschnitte.push({ art: "html", html: md(text, opt) });
    if ((BAUSTEINE as readonly string[]).includes(name)) {
      abschnitte.push({ art: "baustein", name: name as Baustein });
    }
    letzte = (m.index ?? 0) + m[0].length;
  }
  const rest = ohneH1.slice(letzte);
  if (rest.trim()) abschnitte.push({ art: "html", html: md(rest, opt) });
  return abschnitte;
}

function md(text: string, opt: RenderOptionen): string {
  const html = marked.parse(text, { async: false }) as string;
  const mitLinks = opt.bekannteSlugs
    ? html.replace(/<a href="\/at\/([a-z0-9-]+)\/?">([^<]*)<\/a>/g, (full, slug: string, label: string) =>
        opt.bekannteSlugs!.has(slug) ? full : label,
      )
    : html;
  return sanitizeHtmlLib(mitLinks, SANITIZE);
}

export function atFaqJsonLd(seite: AtSeite): object | null {
  if (!seite.faqSchema) return null;
  // Textbausteine wie im Fließtext ersetzen; übrige Platzhalter dürfen nicht
  // roh in den strukturierten Daten für Google landen.
  const faqs: FaqEntry[] = extractFaqs(ersetzeTextbausteine(seite.body));
  if (faqs.length === 0) return null;
  const ohnePlatzhalter = (t: string) => t.replace(PLATZHALTER_RE, "").replace(/[ \t]{2,}/g, " ").trim();
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: ohnePlatzhalter(f.question),
      acceptedAnswer: { "@type": "Answer", text: ohnePlatzhalter(f.answer) },
    })),
  };
}

// KIN-6649 — Magazin: absolute URLs für Strukturdaten und IndexNow.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://orange-octo.com";

/** Registrierungslink des Orange-Octo-Kastens, UTM je Artikel. */
export function registrierungsLink(slug: string): string {
  return `/register?utm_source=magazin&utm_campaign=${encodeURIComponent(slug)}`;
}

export function atBreadcrumbJsonLd(seite: AtSeite): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Magazin", item: `${SITE_URL}/at/magazin` },
      { "@type": "ListItem", position: 2, name: seite.rubrik.name, item: `${SITE_URL}/at/magazin#${seite.rubrik.slug}` },
      { "@type": "ListItem", position: 3, name: seite.h1, item: `${SITE_URL}/at/${seite.slug}` },
    ],
  };
}

export function atArticleJsonLd(seite: AtSeite): object {
  const orangeOcto = { "@type": "Organization", name: "Orange Octo", url: SITE_URL };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: seite.h1,
    description: seite.metaDescription,
    inLanguage: "de-AT",
    articleSection: seite.rubrik.name,
    mainEntityOfPage: `${SITE_URL}/at/${seite.slug}`,
    ...(seite.publishedAt ? { datePublished: seite.publishedAt } : {}),
    ...(seite.updatedAt ?? seite.publishedAt ? { dateModified: seite.updatedAt ?? seite.publishedAt } : {}),
    author: orangeOcto,
    publisher: { ...orangeOcto, logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/octo-icon-orange.png` } },
  };
}
