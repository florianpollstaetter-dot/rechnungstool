"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n-context";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const msg = error.message || "";
      if (/email not confirmed/i.test(msg)) setError(t("login.emailNotConfirmed"));
      else if (/invalid login credentials|invalid credentials/i.test(msg)) setError(t("login.invalidCredentials"));
      else setError(t("login.failed"));
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="max-w-sm w-full">
        <div className="flex flex-col items-center mb-8">
          {/* SCH-915 K2-A1/A2/A3 — orangeocto lockup; orange octopus stays
              orange across all themes, wordmark uses Syne with tight gap. */}
          <div className="flex items-center gap-1.5">
            <Image src="/brand/octo-icon-orange.png" alt="" width={48} height={48} className="h-12 w-12" priority />
            <span className="brand-wordmark text-2xl">orange<span>octo</span></span>
          </div>
          <p className="text-sm text-gray-500 mt-2">easy accounting</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              {t("login.email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              {t("login.password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition"
          >
            {loading ? t("login.submitting") : t("login.submit")}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          {t("login.noAccount")}{" "}
          <Link href="/register" className="text-[var(--accent)] hover:underline font-medium">
            {t("login.register")}
          </Link>
        </p>
      </div>
    </div>
  );
}
