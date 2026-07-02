import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — Buchhaltung & Rechnung für Selbstständige",
  description:
    "Ratgeber zu Rechnung, E-Rechnung, Buchhaltung und Steuern für Selbstständige und Kleinunternehmer in Österreich und Deutschland.",
  alternates: { canonical: "/blog" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("de-AT", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts();

  return (
    <div className="prose-legal text-[var(--text-secondary)] leading-relaxed">
      <h1>Blog</h1>
      <p>
        Praxis-Ratgeber zu Rechnung, E-Rechnung, Buchhaltung und Steuern — für
        Selbstständige und Kleinunternehmer.
      </p>

      {posts.length === 0 ? (
        <p>Es sind derzeit keine Artikel veröffentlicht.</p>
      ) : (
        <ul className="not-prose list-none pl-0 mt-6 space-y-6">
          {posts.map((post) => (
            <li key={post.slug} className="border-b border-[var(--border)] pb-6 last:border-b-0">
              <Link
                href={`/blog/${post.slug}`}
                className="block text-lg font-semibold text-[var(--text-primary)] hover:text-[var(--brand-orange)] transition-colors no-underline"
              >
                {post.title}
              </Link>
              {post.excerpt && (
                <p className="mt-1 mb-1 text-sm text-[var(--text-secondary)]">{post.excerpt}</p>
              )}
              <div className="text-xs text-[var(--text-secondary)] opacity-70 flex items-center gap-2">
                {post.category && <span>{post.category}</span>}
                {post.category && post.publishedAt && <span>·</span>}
                {post.publishedAt && <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
