"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import en from "@/messages/en.json";
import ru from "@/messages/ru.json";
import { DEFAULT_LOCALE, type Locale } from "./i18n-config";

export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "./i18n-config";

const DICTIONARIES = { en, ru } as const;
type Dictionary = typeof en;

type I18nState = {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nState | null>(null);

function walk(dict: Dictionary, path: string): string | undefined {
  const parts = path.split(".");
  let node: unknown = dict;
  for (const p of parts) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[p];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const dict = DICTIONARIES[locale];

  const t = useCallback(
    (key: string, vars: Record<string, string | number> = {}) => {
      const raw = walk(dict, key);
      if (raw === undefined) {
        if (locale !== DEFAULT_LOCALE) {
          const fallback = walk(DICTIONARIES[DEFAULT_LOCALE], key);
          if (fallback !== undefined) return interpolate(fallback, vars);
        }
        return key;
      }
      return interpolate(raw, vars);
    },
    [dict, locale],
  );

  const value = useMemo<I18nState>(() => ({ locale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): (
  key: string,
  vars?: Record<string, string | number>,
) => string {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside <I18nProvider>");
  return ctx.t;
}

export function useLocale(): Locale {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLocale must be used inside <I18nProvider>");
  return ctx.locale;
}

// Convenience: prepend the current locale segment to an app-internal path.
// href("/cart") -> "/en/cart" when locale is "en".
export function useHref(): (path: string) => string {
  const locale = useLocale();
  return useCallback(
    (path: string) => {
      const normalized = path.startsWith("/") ? path : `/${path}`;
      return `/${locale}${normalized === "/" ? "" : normalized}`;
    },
    [locale],
  );
}
