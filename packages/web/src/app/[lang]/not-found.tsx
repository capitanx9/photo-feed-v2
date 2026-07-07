"use client";

import Link from "next/link";
import { useHref, useT } from "@/lib/i18n";

// Rendered when a route under [lang] can't be matched, or when a page
// calls notFound(). Client component so it can reach into the locale
// context for a translated body and a locale-prefixed home link.
export default function NotFound() {
  const t = useT();
  const href = useHref();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-mono text-zinc-400">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {t("errors.notFoundTitle")}
      </h1>
      <p className="mt-3 text-zinc-500">{t("errors.notFoundBody")}</p>
      <Link
        href={href("/")}
        className="mt-8 rounded-full bg-foreground px-5 py-2 text-sm text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        {t("errors.goHome")}
      </Link>
    </main>
  );
}
