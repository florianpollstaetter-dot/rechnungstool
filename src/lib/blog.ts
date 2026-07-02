// ORA-2679 — Blog render infrastructure. Reads the SEO articles committed as
// markdown under `content/blog/*.md` (front-matter authored per SCH-912),
// parses front-matter, renders sanitized HTML, and derives FAQPage JSON-LD.
//
// Server-only: uses `fs` at build time. All article pages are statically
// prerendered (see generateStaticParams in the route), so no per-request fs
// access happens in production.

import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import sanitizeHtmlLib, { type IOptions } from "sanitize-html";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

// Files in content/blog that are documentation, not articles.
const NON_ARTICLE_FILES = new Set(["README.md", "ROADMAP.md"]);

export type BlogPost = {
  slug: string;
  title: string;
  h1: string;
  metaDescription: string;
  publishedAt: string | null;
  updatedAt: string | null;
  category: string | null;
  type: string | null;
  targetKeyword: string | null;
  tags: string[];
  featuredImage: string | null;
  excerpt: string;
  schema: string | null;
  faqs: FaqEntry[];
  body: string;
};

type FrontMatter = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function toPost(slug: string, data: FrontMatter, body: string): BlogPost {
  return {
    slug,
    title: str(data.title) ?? slug,
    h1: str(data.h1) ?? str(data.title) ?? slug,
    metaDescription: str(data.metaDescription) ?? str(data.excerpt) ?? "",
    // gray-matter parses `publishedAt: null` to null and ISO dates to Date.
    publishedAt: normalizeDate(data.publishedAt),
    updatedAt: normalizeDate(data.updatedAt),
    category: str(data.category),
    type: str(data.type),
    targetKeyword: str(data.targetKeyword),
    tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === "string") : [],
    featuredImage: str(data.featuredImage),
    excerpt: str(data.excerpt) ?? "",
    schema: schemaType(data.schema),
    faqs: schemaFaqs(data.schema),
    body,
  };
}

// The `schema` front-matter comes in two shapes across the committed articles:
//   1. a bare string   `schema: FAQPage`            (FAQs live in the body)
//   2. an object       `schema: { type: FAQPage,    (FAQs authored inline)
//                        faqs: [{question, answer}] }`
// schemaType/schemaFaqs normalize both so JSON-LD is emitted either way.
function schemaType(v: unknown): string | null {
  if (typeof v === "string") return v.length > 0 ? v : null;
  if (v && typeof v === "object") return str((v as Record<string, unknown>).type);
  return null;
}

function schemaFaqs(v: unknown): FaqEntry[] {
  if (!v || typeof v !== "object") return [];
  const faqs = (v as Record<string, unknown>).faqs;
  if (!Array.isArray(faqs)) return [];
  return faqs
    .map((f) => {
      if (!f || typeof f !== "object") return null;
      const question = str((f as Record<string, unknown>).question);
      const answer = str((f as Record<string, unknown>).answer);
      return question && answer ? { question, answer } : null;
    })
    .filter((f): f is FaqEntry => f !== null);
}

function normalizeDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && v !== "null" && v.length > 0) return v;
  return null;
}

async function readAllPosts(): Promise<BlogPost[]> {
  const entries = await fs.readdir(BLOG_DIR);
  const files = entries.filter((f) => f.endsWith(".md") && !NON_ARTICLE_FILES.has(f));
  const posts = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(BLOG_DIR, file), "utf8");
      const { data, content } = matter(raw);
      const slug = str(data.slug) ?? file.replace(/\.md$/, "");
      return toPost(slug, data as FrontMatter, content);
    })
  );
  return posts;
}

/** All published articles (publishedAt set), newest first. */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await readAllPosts();
  return posts
    .filter((p) => p.publishedAt != null)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

/** A single published article by slug, or null (drafts return null → 404). */
export async function getPublishedPostBySlug(slug: string): Promise<BlogPost | null> {
  const posts = await readAllPosts();
  const post = posts.find((p) => p.slug === slug);
  if (!post || post.publishedAt == null) return null;
  return post;
}

/** Slugs of every article (published or not) — used to know which internal
 *  links point at blog articles so they can be rewritten to `/blog/<slug>`. */
async function allSlugs(): Promise<Set<string>> {
  const posts = await readAllPosts();
  return new Set(posts.map((p) => p.slug));
}

// Sanitize config mirrors src/lib/sanitize-markdown.ts, but only forces
// target=_blank + rel=noopener on EXTERNAL links; internal /blog links stay
// same-tab for good UX.
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

function sanitizeOpts(): IOptions {
  return {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      "*": ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        const isExternal = /^https?:\/\//i.test(href);
        return {
          tagName,
          attribs: isExternal
            ? { ...attribs, target: "_blank", rel: "noopener noreferrer" }
            : attribs,
        };
      },
    },
  };
}

/** Render an article's markdown body to sanitized HTML, rewriting internal
 *  links that point at other articles (`/<slug>`) to `/blog/<slug>`. */
export async function renderArticleHtml(body: string): Promise<string> {
  const slugs = await allSlugs();
  const html = marked.parse(body, { async: false }) as string;
  const rewritten = html.replace(/href="\/([a-z0-9-]+)"/g, (full, slug: string) =>
    slugs.has(slug) ? `href="/blog/${slug}"` : full
  );
  return sanitizeHtmlLib(rewritten, sanitizeOpts());
}

export type FaqEntry = { question: string; answer: string };

/** Extract Q/A pairs from the article's FAQ section. Convention (per the
 *  committed articles): a `## …FAQ…` heading followed by `**Question?**`
 *  lines each trailed by an answer paragraph. */
export function extractFaqs(body: string): FaqEntry[] {
  const lines = body.split("\n");
  const faqStart = lines.findIndex((l) => /^#{2,3}\s.*(FAQ|Häufige Fragen)/i.test(l));
  if (faqStart === -1) return [];
  const section = lines.slice(faqStart + 1);
  const faqs: FaqEntry[] = [];
  let current: FaqEntry | null = null;
  for (const line of section) {
    if (/^#{1,3}\s/.test(line)) break; // next section
    const q = line.match(/^\*\*(.+?)\*\*\s*$/);
    if (q) {
      if (current) faqs.push(current);
      current = { question: q[1].trim(), answer: "" };
    } else if (current && line.trim() && !line.startsWith("---")) {
      current.answer = current.answer ? `${current.answer} ${line.trim()}` : line.trim();
    }
  }
  if (current && current.answer) faqs.push(current);
  return faqs.filter((f) => f.answer.length > 0);
}

/** Build schema.org FAQPage JSON-LD, or null if the article has no FAQ. */
export function faqJsonLd(post: BlogPost): object | null {
  if (post.schema !== "FAQPage") return null;
  // Prefer structured front-matter FAQs; fall back to parsing the body for
  // older articles that only declare `schema: FAQPage` as a string.
  const faqs = post.faqs.length > 0 ? post.faqs : extractFaqs(post.body);
  if (faqs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}
