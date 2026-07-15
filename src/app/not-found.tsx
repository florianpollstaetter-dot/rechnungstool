import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Seite nicht gefunden",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 py-16 text-center bg-[var(--background)] text-[var(--text-primary)]">
      <Link href="/" className="flex items-center gap-2" aria-label="orangeocto">
        <Image
          src="/brand/octo-icon-orange.png"
          alt=""
          width={48}
          height={48}
          className="h-12 w-12"
          priority
        />
        <span className="brand-wordmark text-lg">
          orange<span>octo</span>
        </span>
      </Link>

      <p className="text-6xl font-bold text-[var(--brand-orange)]">404</p>

      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-semibold">Seite nicht gefunden</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
      </div>

      <Link
        href="/dashboard"
        className="mt-2 inline-flex items-center gap-2 bg-[var(--accent)] text-black px-5 py-2.5 rounded-lg text-sm font-semibold hover:brightness-110 transition"
      >
        Zurück zum Dashboard
      </Link>
    </main>
  );
}
