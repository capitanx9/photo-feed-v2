"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n";

// Route-level error boundary for the [lang] segment. `error.tsx` must
// be a Client Component (Next 16). We log once on mount so the error
// shows up in the browser console / any wired-up reporting sink, then
// offer the user a chance to retry the failed render via `reset`.
export default function LangError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error("route error", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-mono text-zinc-400">500</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {t("errors.serverTitle")}
      </h1>
      <p className="mt-3 text-zinc-500">{t("errors.serverBody")}</p>
      {error.digest && (
        <p className="mt-2 text-xs font-mono text-zinc-400">{error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-8 rounded-full bg-foreground px-5 py-2 text-sm text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        {t("errors.tryAgain")}
      </button>
    </main>
  );
}
