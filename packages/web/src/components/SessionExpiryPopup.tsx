"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

// Rendered by <AuthProvider>. Shown for 60 seconds before the access-token
// deadline set by /api/auth/{login,refresh,me}. Two buttons:
//   * Stay signed in — POST /api/auth/refresh/, which reschedules from the
//     fresh `expires_at` in the response.
//   * Log out — POST /api/auth/logout/ + redirect to /<locale>/login.
// If the user does nothing, the auto-logout timer inside AuthProvider fires
// at `expires_at` and takes the same "log out + redirect" path.
export function SessionExpiryPopup() {
  const { warningVisible, extendSession, logoutAndRedirect } = useAuth();
  const t = useT();
  const [busy, setBusy] = useState<"stay" | "logout" | null>(null);
  // A stale click on "Stay signed in" after the modal auto-dismisses (e.g.
  // the auto-logout timer already fired) must not re-open the modal via
  // setBusy(null). We track mount status to short-circuit state updates
  // after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (!warningVisible) return null;

  async function handleStay() {
    setBusy("stay");
    try {
      await extendSession();
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  }

  async function handleLogout() {
    setBusy("logout");
    try {
      await logoutAndRedirect();
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expiry-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-lg border border-black/[.08] bg-background p-5 shadow-xl dark:border-white/[.145]">
        <h2 id="session-expiry-title" className="text-lg font-semibold">
          {t("session.title")}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {t("session.body")}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleLogout}
            disabled={busy !== null}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm hover:bg-black/[.04] disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            {busy === "logout" ? t("session.loggingOut") : t("session.logout")}
          </button>
          <button
            type="button"
            onClick={handleStay}
            disabled={busy !== null}
            className="rounded-full bg-foreground px-4 py-2 text-sm text-background hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
          >
            {busy === "stay" ? t("session.staying") : t("session.stay")}
          </button>
        </div>
      </div>
    </div>
  );
}
