"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Redirects logged-in users flagged with `must_change_password = true` to
 * `/force-password-change`. Mount once near the top of authenticated layouts.
 */
export function PasswordChangeGate() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("must_change_password")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.must_change_password) {
        router.replace("/force-password-change");
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
