// SCH-825 M1+M8 — PM root layout. Header carries the workspace link, the
// notifications bell (M8), and the back-to-OO link.

import Link from "next/link";
import { NotificationsBell } from "./_components/NotificationsBell";

export default function PmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/pm" className="text-lg font-semibold tracking-tight">
            PM
          </Link>
          <div className="flex items-center gap-4">
            <NotificationsBell />
            <Link
              href="/dashboard"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              ← Orange Octo
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
