"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n-context";

type Step = "credentials" | "company";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[äö ü]/g, (c) => ({ "ä": "ae", "ö": "oe", "ü": "ue" }[c] || c))
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError(t("register.passwordTooShort"));
      return;
    }
    if (password !== passwordConfirm) {
      setError(t("register.passwordMismatch"));
      return;
    }
    setStep("company");
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!companyName.trim()) {
      setError(t("register.enterCompanyName"));
      setLoading(false);
      return;
    }

    const slug = companySlug || generateSlug(companyName);

    // 1. Create the user + company server-side (email auto-confirmed via service role).
    const res = await fetch("/api/register-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        displayName: displayName || email.split("@")[0],
        companyName: companyName.trim(),
        companySlug: slug,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      const code = body.error;
      if (code === "email_exists") setError(t("register.emailExists"));
      else if (code === "slug_taken") setError(t("register.slugTaken"));
      else if (code === "weak_password") setError(t("register.passwordTooShort"));
      else setError(body.message || t("register.registrationFailedGeneric"));
      setLoading(false);
      return;
    }

    // 2. Sign in to establish the browser session with fresh JWT claims.
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(`${t("register.registrationFailed")} ${signInError.message}`);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  const inputClass = "w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Orange Octo</h1>
          <p className="text-sm text-gray-500 mt-1">{t("register.title")}</p>
        </div>

        {step === "credentials" && (
          <form
            onSubmit={handleCredentials}
            className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("register.name")}</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className={inputClass} placeholder="Max Mustermann" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("register.email")}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className={inputClass} placeholder="max@unternehmen.at" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("register.password")}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("register.confirmPassword")}</label>
              <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required
                className={inputClass} />
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button type="submit"
              className="w-full bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition">
              {t("register.next")}
            </button>
          </form>
        )}

        {step === "company" && (
          <form
            onSubmit={handleRegister}
            className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 space-y-4"
          >
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              {t("register.companySetupHint")}
            </p>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{t("register.companyName")}</label>
              <input type="text" value={companyName} onChange={(e) => {
                setCompanyName(e.target.value);
                if (!companySlug || companySlug === generateSlug(companyName)) {
                  setCompanySlug(generateSlug(e.target.value));
                }
              }} required className={inputClass} placeholder="Mein Unternehmen GmbH" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                {t("register.companySlug")} <span className="text-gray-500 font-normal">{t("register.slugHint")}</span>
              </label>
              <input type="text" value={companySlug} onChange={(e) => setCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className={inputClass} placeholder="mein-unternehmen" maxLength={30} />
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-emerald-400">
                {t("register.trialHint")}
              </p>
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep("credentials")}
                className="flex-1 border border-[var(--border)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--surface-hover)] transition">
                {t("register.back")}
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition">
                {loading ? t("register.submitting") : t("register.submit")}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-4">
          {t("register.hasAccount")}{" "}
          <Link href="/login" className="text-[var(--accent)] hover:underline font-medium">
            {t("register.login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
