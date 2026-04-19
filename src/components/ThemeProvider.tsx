"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Theme = "dark" | "light" | "sand";

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "dark",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "sand") return stored;
  return "dark";
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  // Gate persistence: only write localStorage when the user is authenticated.
  // Without this, the post-logout reset to "dark" would overwrite the user's saved preference.
  const authedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const hasSession = !!data.session;
      authedRef.current = hasSession;
      setThemeState(hasSession ? readStoredTheme() : "dark");
      setMounted(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        authedRef.current = true;
        setThemeState(readStoredTheme());
      } else if (event === "SIGNED_OUT") {
        authedRef.current = false;
        setThemeState("dark");
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    if (authedRef.current) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, mounted]);

  function setTheme(t: Theme) {
    setThemeState(t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
