"use client";

// SCH-962 — full-screen gate that blocks the app when an operator has
// suspended every company the current user belongs to. Renders a static
// notice with a sign-out button so the user can leave + contact support.

import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/lib/company-context";
import { useRouter } from "next/navigation";

export function BlockedCompanyGate() {
  const { companyAccessBlocked, authed, roleLoaded } = useCompany();
  const router = useRouter();

  if (!authed || !roleLoaded || !companyAccessBlocked) return null;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl max-w-md w-full p-6 text-center">
        <div className="text-rose-500 text-3xl mb-3">⛔</div>
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">
          Unternehmen gesperrt
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Dieses Unternehmen wurde vorübergehend gesperrt. Bitte kontaktiere den
          Support, um den Zugriff wiederherzustellen.
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-5">
          E-Mail: <a className="underline" href="mailto:support@orange-octo.com">support@orange-octo.com</a>
        </p>
        <button
          onClick={signOut}
          className="w-full px-4 py-2 text-sm font-medium bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
        >
          Abmelden
        </button>
      </div>
    </div>
  );
}
