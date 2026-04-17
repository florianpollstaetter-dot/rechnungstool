// SCH-447 — Resolver for user-generated content translations stored in JSONB columns
// (Product.name_translations, CompanySettings.accompanying_text_translations, etc.).
//
// Fallback chain: requested locale → de → en → fallback string.

import type { ContentLocale, TranslationMap, Product } from "./types";

export const CONTENT_LOCALES: { code: ContentLocale; label: string; flag: string }[] = [
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
];

export function resolveTranslation(
  translations: TranslationMap | null | undefined,
  locale: ContentLocale,
  fallback = "",
): string {
  if (translations) {
    const own = translations[locale];
    if (own && own.trim() !== "") return own;
    const de = translations.de;
    if (de && de.trim() !== "") return de;
    const en = translations.en;
    if (en && en.trim() !== "") return en;
  }
  return fallback;
}

export function getProductName(product: Product, locale: ContentLocale): string {
  // Prefer JSONB, but keep legacy name/name_en as last-resort fallback.
  return resolveTranslation(product.name_translations, locale, product.name || product.name_en || "");
}

export function getProductDescription(product: Product, locale: ContentLocale): string {
  return resolveTranslation(
    product.description_translations,
    locale,
    product.description || product.description_en || "",
  );
}
