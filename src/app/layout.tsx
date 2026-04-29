import type { Metadata, Viewport } from "next";
import { Geist, Unbounded, Syne } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import { CompanyProvider } from "@/lib/company-context";
import { I18nProvider } from "@/lib/i18n-context";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import CookieBanner from "@/components/CookieBanner";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// SCH-819 Phase 3 — Florian: "Hervorhebungen auf Font 'Bounded Black' umstellen".
// Next.js' next/font/google exposes Unbounded (Google Fonts ID `Unbounded`); the
// 900 cut is the "Black" weight. Exposed via a CSS variable so the marketing
// landing's CSS module can opt in for headlines.
const bounded = Unbounded({
  variable: "--font-bounded",
  subsets: ["latin"],
  weight: ["900"],
  display: "swap",
});

// SCH-915 K2-A1 — Syne is the brand wordmark face used across all
// "orangeocto" lockups (sidebar, mobile header, legal pages, register, login).
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://orange-octo.com";
const SITE_TITLE = "Orange Octo — KI-gestützte Buchhaltung für Selbstständige";
const SITE_DESCRIPTION =
  "Rechnungen, Angebote, Belege und Zeiterfassung in einer einfachen App. KI-vorausgefüllte Felder, E-Rechnung (EN-16931), Made in Austria.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · Orange Octo",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Orange Octo",
  keywords: [
    "Buchhaltung",
    "Rechnung",
    "Angebot",
    "Zeiterfassung",
    "Spesen",
    "E-Rechnung",
    "EN-16931",
    "Selbstständige",
    "Freelancer",
    "Österreich",
    "Austria",
    "SaaS",
    "Accounting",
    "Invoicing",
  ],
  authors: [{ name: "Orange Octo" }],
  creator: "Orange Octo",
  publisher: "Orange Octo",
  manifest: "/manifest.json",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "de_AT",
    url: SITE_URL,
    siteName: "Orange Octo",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/brand/octo-logo-full-white.png",
        width: 1200,
        height: 630,
        alt: "Orange Octo — KI-gestützte Buchhaltung",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/brand/octo-logo-full-white.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Orange Octo",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

// SCH-919 K2-O1 — explicit viewport export so iOS Safari uses device width.
// `viewportFit: "cover"` lets us reach the safe-area edges (no white gutters
// left/right per K2-O5). We deliberately do NOT set `maximumScale`/
// `userScalable: false` — pinch-zoom must stay available for accessibility.
// The auto-zoom-on-input issue is addressed by the 16px min font-size rule
// in globals.css.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f97316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${geist.variable} ${bounded.variable} ${syne.variable} h-full antialiased`}>
      <head>
        <link rel="apple-touch-icon" href="/brand/octo-icon-orange.png" />
      </head>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-geist-sans)]">
        <ThemeProvider><I18nProvider><CompanyProvider><ServiceWorkerRegistrar />{children}<CookieBanner /></CompanyProvider></I18nProvider></ThemeProvider>
      </body>
    </html>
  );
}
