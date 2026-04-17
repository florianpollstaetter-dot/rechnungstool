import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import { CompanyProvider } from "@/lib/company-context";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orange Octo — easy accounting",
  description: "Rechnungen, Angebote, Belege und Zeiterfassung — einfach und schnell.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Orange Octo",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${geist.variable} h-full antialiased`}>
      <head>
        <meta name="theme-color" content="#f97316" />
        <link rel="apple-touch-icon" href="/brand/octo-icon-orange.png" />
      </head>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-geist-sans)]">
        <ThemeProvider><CompanyProvider><ServiceWorkerRegistrar />{children}</CompanyProvider></ThemeProvider>
      </body>
    </html>
  );
}
