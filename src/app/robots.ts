import type { MetadataRoute } from "next";

// SCH-819 Phase-6 — robots.txt generated at build time. Crawlers can index
// the marketing + legal surface; everything authenticated and the API
// surface stays disallowed.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://orange-octo.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/login",
          "/register",
          "/impressum",
          "/datenschutz",
          "/agb",
        ],
        disallow: [
          "/api/",
          "/dashboard",
          "/quotes",
          "/invoices",
          "/customers",
          "/products",
          "/fixed-costs",
          "/receipts",
          "/bank",
          "/expenses",
          "/export",
          "/time",
          "/admin",
          "/settings",
          "/operator",
          "/force-password-change",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
