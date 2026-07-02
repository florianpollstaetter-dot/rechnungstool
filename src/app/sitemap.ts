import type { MetadataRoute } from "next";
import { getPublishedPosts } from "@/lib/blog";

// SCH-819 Phase-6 — sitemap.xml generated at build time. Only public-facing
// surfaces; authenticated app routes are excluded (they require login and
// shouldn't appear in search results).
// ORA-2679 — published blog articles (content/blog/*.md) are enumerated too.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://orange-octo.com";
  const now = new Date();
  const routes: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }[] = [
    { path: "/",            priority: 1.0, changeFrequency: "weekly" },
    { path: "/blog",        priority: 0.7, changeFrequency: "weekly" },
    { path: "/register",    priority: 0.8, changeFrequency: "monthly" },
    { path: "/login",       priority: 0.6, changeFrequency: "monthly" },
    { path: "/impressum",   priority: 0.4, changeFrequency: "yearly" },
    { path: "/datenschutz", priority: 0.4, changeFrequency: "yearly" },
    { path: "/agb",         priority: 0.4, changeFrequency: "yearly" },
  ];

  const staticEntries: MetadataRoute.Sitemap = routes.map((r) => ({
    url: `${baseUrl}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const posts = await getPublishedPosts();
  const blogEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${baseUrl}/blog/${p.slug}`,
    lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...blogEntries];
}
