"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiFetchError, api, type SessionUser, type User } from "./api";
import { LOCALES, DEFAULT_LOCALE } from "./i18n-config";

// Show the "session about to expire" warning this many milliseconds before
// the deadline the server told us about.
const WARNING_LEAD_MS = 60_000;

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  // --- session-expiry surface, wired up by <SessionExpiryPopup> ---
  warningVisible: boolean;
  extendSession: () => Promise<void>;
  logoutAndRedirect: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Best-effort read of the current locale from the path prefix so the redirect
// after auto-logout keeps the user in their language. Kept in sync with the
// [lang] route segment. Falls back to the default locale for API-only or
// pre-route contexts.
function localeFromPath(pathname: string): string {
  const first = pathname.split("/")[1] ?? "";
  return (LOCALES as readonly string[]).includes(first)
    ? first
    : DEFAULT_LOCALE;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // `loading` is only true for the initial hydration probe. Login/register
  // flows expose pending state via their own local component state.
  const [loading, setLoading] = useState(true);
  // Deadline is stored in state so re-renders can pick it up, but the
  // scheduling effect reads it via the ref so we don't reschedule on
  // every unrelated render.
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [warningVisible, setWarningVisible] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  // Timer ids live in refs — reassigning refs doesn't trigger the
  // set-state-in-effect / immutability lints, and the effect can safely
  // clear whichever ones are pending on cleanup.
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (warnTimerRef.current !== null) {
      clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    if (expireTimerRef.current !== null) {
      clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
  }, []);

  // Consumers of an auth response call this to seed / reschedule the
  // deadline. Passing null (e.g. after logout) clears everything.
  const applySession = useCallback((iso: string | null) => {
    if (iso === null) {
      setExpiresAt(null);
      setWarningVisible(false);
      return;
    }
    const parsed = Date.parse(iso);
    setExpiresAt(Number.isNaN(parsed) ? null : parsed);
    setWarningVisible(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SessionUser>("/api/auth/me/")
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        applySession(u.expires_at ?? null);
      })
      .catch((err) => {
        // 401 is the expected "no session" case; anything else we ignore
        // silently at hydration time and let subsequent calls surface.
        if (!(err instanceof ApiFetchError) || err.status !== 401) {
          console.warn("auth hydrate failed", err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const u = await api.post<SessionUser>("/api/auth/login/", {
        email,
        password,
      });
      setUser(u);
      applySession(u.expires_at ?? null);
    },
    [applySession],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await api.post<User>("/api/auth/register/", { email, password });
      // Register does not log the user in server-side (no cookie set),
      // so we chain login for a natural single-step signup UX.
      const u = await api.post<SessionUser>("/api/auth/login/", {
        email,
        password,
      });
      setUser(u);
      applySession(u.expires_at ?? null);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post<void>("/api/auth/logout/");
    } finally {
      setUser(null);
      applySession(null);
    }
  }, [applySession]);

  const refreshUser = useCallback(async () => {
    const u = await api.get<SessionUser>("/api/auth/me/");
    setUser(u);
    applySession(u.expires_at ?? null);
  }, [applySession]);

  // Called from the "Stay signed in" button. Rotates tokens and rearms the
  // timers from the fresh deadline in the response body.
  const extendSession = useCallback(async () => {
    try {
      const u = await api.post<SessionUser>("/api/auth/refresh/");
      setUser(u);
      applySession(u.expires_at ?? null);
    } catch (err) {
      // Refresh failed (e.g. rotated cookie replayed, or refresh already
      // expired). Fall through to the sign-off path.
      if (!(err instanceof ApiFetchError)) console.warn("refresh failed", err);
      setUser(null);
      applySession(null);
      const locale = localeFromPath(pathname);
      router.push(`/${locale}/login`);
    }
  }, [applySession, pathname, router]);

  // Called from the "Log out" button in the popup, and from the auto-fire
  // timer when the deadline is reached with no action.
  const logoutAndRedirect = useCallback(async () => {
    try {
      await api.post<void>("/api/auth/logout/");
    } catch {
      // Cookie may already be expired server-side; either way we want the
      // client to end up signed out and on /login.
    }
    setUser(null);
    applySession(null);
    const locale = localeFromPath(pathname);
    router.push(`/${locale}/login`);
    router.refresh();
  }, [applySession, pathname, router]);

  // Timers. Re-run whenever the deadline changes. Refs — not state — hold
  // the timer ids so the effect stays a one-shot scheduler without tripping
  // the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    clearTimers();
    if (expiresAt === null) return;
    const now = Date.now();
    const warnAt = expiresAt - WARNING_LEAD_MS - now;
    const expireAt = expiresAt - now;

    // Show the warning at the lead time — or immediately (via a 0-ms
    // timer, so the state update lands after the effect commits rather
    // than during it) if we're already inside the warning window.
    const warnDelay = warnAt > 0 ? warnAt : 0;
    if (expireAt > 0) {
      warnTimerRef.current = setTimeout(() => {
        setWarningVisible(true);
      }, warnDelay);
    }

    if (expireAt <= 0) {
      // Already past the deadline. Fire the sign-off asynchronously so we
      // don't setState during render.
      const t = setTimeout(() => {
        void logoutAndRedirect();
      }, 0);
      expireTimerRef.current = t;
    } else {
      expireTimerRef.current = setTimeout(() => {
        void logoutAndRedirect();
      }, expireAt);
    }

    return clearTimers;
  }, [expiresAt, clearTimers, logoutAndRedirect]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
        warningVisible,
        extendSession,
        logoutAndRedirect,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
