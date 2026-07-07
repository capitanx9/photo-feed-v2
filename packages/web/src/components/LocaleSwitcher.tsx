"use client";

import { usePathname, useRouter } from "next/navigation";
import { LOCALES, LOCALE_COOKIE, useLocale, type Locale } from "@/lib/i18n";

const LABELS: Record<Locale, string> = { en: "EN", ru: "RU" };

export function LocaleSwitcher() {
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function pick(next: Locale) {
    if (next === current) return;
    // Cookie is read by proxy.ts on subsequent full-page requests, and
    // also lets a fresh visitor land on their last-picked locale.
    // document.cookie is a magic setter — the "assignment" appends a
    // cookie rather than replacing the whole jar, which the immutability
    // lint rule doesn't model.
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    // Swap the locale segment in the current path.
    const stripped = pathname.replace(
      new RegExp(`^/(${LOCALES.join("|")})(?=/|$)`),
      "",
    );
    router.push(`/${next}${stripped || "/"}`);
    router.refresh();
  }

  return (
    <div className="flex gap-1 rounded-full border border-black/[.08] p-0.5 text-xs dark:border-white/[.145]">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          aria-pressed={l === current}
          className={`rounded-full px-2 py-0.5 ${
            l === current
              ? "bg-foreground text-background"
              : "text-zinc-500 hover:text-foreground"
          }`}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
