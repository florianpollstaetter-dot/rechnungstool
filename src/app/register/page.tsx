"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n-context";
import styles from "./register.module.css";

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

  return (
    <div className={styles.root}>
      <link
        href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.logo} aria-label="Orange Octo Startseite">
            <Image
              src="/brand/octo-icon-orange.png"
              alt="Orange Octo"
              width={56}
              height={56}
              priority
              className={styles.logoIcon}
            />
            <span className={styles.logoWord}>
              Orange<span>Octo</span>
            </span>
          </Link>
          <nav className={styles.headerLinks}>
            <Link href="/" className={styles.headerLink}>
              Startseite
            </Link>
            <Link href="/login" className={styles.headerLinkAccent}>
              Login
            </Link>
          </nav>
        </div>
      </header>

      <div className={styles.content}>
        <span className={styles.badge}>
          <span className={styles.badgeDot} />
          14 Tage kostenlos testen · Keine Kreditkarte
        </span>

        <h1 className={styles.title}>Konto erstellen</h1>
        <p className={styles.subtitle}>
          In 60 Sekunden loslegen. Alle Features freigeschaltet — ganz ohne Zahlungsdaten.
        </p>

        <div className={styles.steps} aria-hidden="true">
          <div className={`${styles.step} ${styles.stepActive}`}>
            <span className={styles.stepDot}>1</span>
            Zugangsdaten
          </div>
          <span className={styles.stepSep} />
          <div className={`${styles.step} ${step === "company" ? styles.stepActive : ""}`}>
            <span className={styles.stepDot}>2</span>
            Unternehmen
          </div>
        </div>

        {step === "credentials" && (
          <form onSubmit={handleCredentials} className={styles.card}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>{t("register.name")}</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={styles.input}
                placeholder="Max Mustermann"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>{t("register.email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={styles.input}
                placeholder="max@unternehmen.at"
                autoComplete="email"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>{t("register.password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={styles.input}
                autoComplete="new-password"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>{t("register.confirmPassword")}</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                className={styles.input}
                autoComplete="new-password"
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button type="submit" className={styles.btnPrimary}>
                {t("register.next")}
              </button>
            </div>
          </form>
        )}

        {step === "company" && (
          <form onSubmit={handleRegister} className={styles.card}>
            <p className={styles.subtitle} style={{ textAlign: "left", marginBottom: 4 }}>
              {t("register.companySetupHint")}
            </p>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>{t("register.companyName")}</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  if (!companySlug || companySlug === generateSlug(companyName)) {
                    setCompanySlug(generateSlug(e.target.value));
                  }
                }}
                required
                className={styles.input}
                placeholder="Mein Unternehmen GmbH"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                {t("register.companySlug")}
                <span className={styles.labelHint}>{t("register.slugHint")}</span>
              </label>
              <input
                type="text"
                value={companySlug}
                onChange={(e) => setCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className={styles.input}
                placeholder="mein-unternehmen"
                maxLength={30}
              />
            </div>

            <div className={styles.trialHint}>
              <span className={styles.trialHintIcon}>✓</span>
              <span>{t("register.trialHint")}</span>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button type="button" onClick={() => setStep("credentials")} className={styles.btnSecondary}>
                {t("register.back")}
              </button>
              <button type="submit" disabled={loading} className={styles.btnPrimary}>
                {loading ? t("register.submitting") : t("register.submit")}
              </button>
            </div>
          </form>
        )}

        <div className={styles.aside}>
          <div className={styles.asideTitle}>Was dich erwartet</div>
          <div className={styles.perksList}>
            <div className={styles.perk}>
              <span className={styles.perkCheck}>✓</span>
              Alle Features freigeschaltet — 14 Tage
            </div>
            <div className={styles.perk}>
              <span className={styles.perkCheck}>✓</span>
              Unbegrenzte Belege, Rechnungen &amp; Angebote
            </div>
            <div className={styles.perk}>
              <span className={styles.perkCheck}>✓</span>
              DATEV-Export &amp; E-Rechnung inklusive
            </div>
            <div className={styles.perk}>
              <span className={styles.perkCheck}>✓</span>
              Monatlich kündbar — keine Bindung
            </div>
          </div>
        </div>

        <p className={styles.footerLinkRow}>
          {t("register.hasAccount")}
          <Link href="/login">{t("register.login")}</Link>
        </p>
      </div>
    </div>
  );
}
