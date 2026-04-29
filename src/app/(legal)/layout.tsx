import Link from "next/link";
import Image from "next/image";
import { AppFooter } from "@/components/AppFooter";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 shrink-0" title="orangeocto" aria-label="orangeocto">
            <Image src="/brand/octo-icon-orange.png" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="brand-wordmark text-sm hidden sm:inline">orange<span>octo</span></span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <Link href="/impressum" className="text-[var(--text-secondary)] hover:text-[var(--brand-orange)] transition-colors">Impressum</Link>
            <Link href="/agb" className="text-[var(--text-secondary)] hover:text-[var(--brand-orange)] transition-colors">AGB</Link>
            <Link href="/datenschutz" className="text-[var(--text-secondary)] hover:text-[var(--brand-orange)] transition-colors">Datenschutz</Link>
          </div>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full flex-1">
        <article className="prose-legal text-[var(--text-secondary)] leading-relaxed">
          {children}
        </article>
      </main>
      <AppFooter />
    </>
  );
}
