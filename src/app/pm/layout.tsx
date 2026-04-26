// SCH-825 M1 — PM root layout. Sidebar comes in M2 (project nav). For M1 we
// only need the auth shell + a minimal header.

import Link from "next/link";

export default function PmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/pm" className="text-lg font-semibold tracking-tight">
            PM
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ← Orange Octo
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
