"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import de, { TranslationKey } from "@/lib/translations/de";

export type AppLocale = "de" | "en" | "fr" | "es" | "it" | "tr" | "pl" | "ar";

export const SUPPORTED_LOCALES: { code: AppLocale; label: string; flag: string }[] = [
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
];

type Translations = Record<string, string>;

interface I18nContextType {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "de",
  setLocale: () => {},
  t: (key) => key,
});

const translationCache: Partial<Record<AppLocale, Translations>> = {
  de: de as unknown as Translations,
};

async function loadTranslations(locale: AppLocale): Promise<Translations> {
  if (translationCache[locale]) return translationCache[locale]!;

  let mod: { default: Translations };
  switch (locale) {
    case "en": mod = await import("@/lib/translations/en"); break;
    case "fr": mod = await import("@/lib/translations/fr"); break;
    case "es": mod = await import("@/lib/translations/es"); break;
    case "it": mod = await import("@/lib/translations/it"); break;
    case "tr": mod = await import("@/lib/translations/tr"); break;
    case "pl": mod = await import("@/lib/translations/pl"); break;
    case "ar": mod = await import("@/lib/translations/ar"); break;
    default: return de as unknown as Translations;
  }

  translationCache[locale] = mod.default;
  return mod.default;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("appLocale") as AppLocale) || "de";
    }
    return "de";
  });
  const [translations, setTranslations] = useState<Translations>(de as unknown as Translations);

  useEffect(() => {
    loadTranslations(locale).then(setTranslations);
  }, [locale]);

  const setLocale = useCallback((newLocale: AppLocale) => {
    setLocaleState(newLocale);
    localStorage.setItem("appLocale", newLocale);
    // Update HTML lang attribute
    document.documentElement.lang = newLocale;
    // Update dir attribute for RTL (Arabic)
    document.documentElement.dir = newLocale === "ar" ? "rtl" : "ltr";
  }, []);

  // Set initial dir/lang on mount
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      let text = translations[key] || (de as unknown as Translations)[key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return text;
    },
    [translations],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
