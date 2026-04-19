"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./landing.module.css";

export default function LandingHeaderLogin() {
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
    <form className={styles.inlineLogin} onSubmit={handleSubmit} aria-label="Anmelden">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-Mail"
        autoComplete="email"
        className={styles.inlineLoginInput}
      />
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Passwort"
        autoComplete="current-password"
        className={styles.inlineLoginInput}
      />
      <button type="submit" disabled={loading} className={styles.inlineLoginBtn}>
        {loading ? "…" : "Login"}
      </button>
      {error && <span className={styles.inlineLoginError}>{error}</span>}
    </form>
  );
}
