import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPublishedPosts,
  getPublishedPostBySlug,
  renderArticleHtml,
  faqJsonLd,
} from "@/lib/blog";

type Params = { slug: string };

// Prerender every published article; unknown/draft slugs 404.
export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  const posts = await getPublishedPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.metaDescription,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.metaDescription,
      url: `/blog/${post.slug}`,
      ...(post.featuredImage ? { images: [{ url: post.featuredImage }] } : {}),
      ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
      ...(post.updatedAt ? { modifiedTime: post.updatedAt } : {}),
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

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const html = await renderArticleHtml(post.body);
  const jsonLd = faqJsonLd(post);

  return (
    <article className="prose-legal text-[var(--text-secondary)] leading-relaxed">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <div className="not-prose mb-4">
        <Link href="/blog" className="text-xs text-[var(--brand-orange)] hover:underline">
          ← Alle Artikel
        </Link>
      </div>
      <h1>{post.h1}</h1>
      <div className="text-xs text-[var(--text-secondary)] opacity-70 mb-6 flex items-center gap-2">
        {post.category && <span>{post.category}</span>}
        {post.category && post.updatedAt && <span>·</span>}
        {post.updatedAt && (
          <span>
            Aktualisiert: <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>
          </span>
        )}
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
