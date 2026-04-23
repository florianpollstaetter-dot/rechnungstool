import type { NextConfig } from "next";

// SCH-600 Phase-5 — baseline security headers. A full Content-Security-Policy
// is intentionally NOT enforced here yet: the app pulls inline styles and
// third-party scripts (Stripe, Supabase, Replicate) that need per-route
// review before we can ship a strict CSP. The always-safe headers below
// cover clickjacking, MIME-sniffing, referer leakage, and HSTS for prod
// origins.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.ts",
    },
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
