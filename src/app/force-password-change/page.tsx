"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ForcePasswordChangePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setEmail(user.email || "");
      // If the flag is no longer set, bounce back to the app.
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("must_change_password")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!profile?.must_change_password) {
        router.replace("/");
        return;
      }
      setChecking(false);
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError("Sitzung abgelaufen. Bitte neu einloggen.");
      setSaving(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    const { error: clearError } = await supabase
      .from("user_profiles")
      .update({ must_change_password: false })
      .eq("auth_user_id", user.id);
    if (clearError) {
      setError(clearError.message);
      setSaving(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-sm text-[var(--text-muted)]">Lade…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Neues Passwort vergeben</h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Dein Passwort wurde vom Support zurückgesetzt. Bitte vergib jetzt ein neues Passwort, um fortzufahren.
          </p>
          {email && (
            <p className="text-xs text-[var(--text-muted)] mt-2">Angemeldet als <strong>{email}</strong></p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Neues Passwort
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoFocus
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              placeholder="mindestens 8 Zeichen"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Passwort bestätigen
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            />
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition"
          >
            {saving ? "Speichere…" : "Neues Passwort speichern"}
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            onClick={handleLogout}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}
