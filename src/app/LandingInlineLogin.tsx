"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./landing.module.css";

export default function LandingInlineLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      const msg = signInError.message || "";
      if (/invalid login credentials|invalid credentials/i.test(msg)) setError("Falsche Zugangsdaten");
      else if (/email not confirmed/i.test(msg)) setError("E-Mail nicht bestätigt");
      else setError("Anmeldung fehlgeschlagen");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <section className={styles.embeddedLoginSection} id="login">
      <div className={styles.container}>
        <div className={styles.embeddedLoginCard}>
          <div className={styles.embeddedLoginText}>
            <div className={styles.sectionLabel}>Schon Kunde?</div>
            <h2 className={styles.embeddedLoginHeadline}>Direkt anmelden.</h2>
            <p className={styles.embeddedLoginBody}>
              Melde dich mit deinen Zugangsdaten an — ohne Umleitung auf eine separate Login-Seite. Neu hier?{" "}
              <Link href="/register" className={styles.embeddedLoginLink}>
                Kostenlos registrieren
              </Link>
              .
            </p>
          </div>

          <form className={styles.embeddedLoginForm} onSubmit={handleSubmit} aria-label="Anmelden">
            <label className={styles.embeddedLoginLabel}>
              <span>E-Mail</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="du@firma.de"
                autoComplete="email"
                className={styles.embeddedLoginInput}
              />
            </label>

            <label className={styles.embeddedLoginLabel}>
              <span>Passwort</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort"
                autoComplete="current-password"
                className={styles.embeddedLoginInput}
              />
            </label>

            {error && <div className={styles.embeddedLoginErrorRow}>{error}</div>}

            <button type="submit" disabled={loading} className={styles.embeddedLoginSubmit}>
              {loading ? "Anmelden…" : "Login"}
            </button>

            <div className={styles.embeddedLoginMeta}>
              <Link href="/login" className={styles.embeddedLoginMetaLink}>
                Probleme beim Anmelden?
              </Link>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
