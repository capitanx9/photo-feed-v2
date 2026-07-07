// Locale constants shared between server code (proxy.ts, layout
// generateStaticParams) and client code (I18nProvider, LocaleSwitcher).
// Kept in a plain module — no "use client" — so both worlds import
// safely.

export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(v: string): v is Locale {
  return (LOCALES as readonly string[]).includes(v);
}
