"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiFetchError, api, type User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // `loading` is only true for the initial hydration probe. Login/register
  // flows expose pending state via their own local component state.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<User>("/api/auth/me/")
      .then((u) => {
        if (!cancelled) setUser(u);
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
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<User>("/api/auth/login/", { email, password });
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await api.post<User>("/api/auth/register/", { email, password });
    // Register does not log the user in server-side (no cookie set),
    // so we chain login for a natural single-step signup UX.
    const u = await api.post<User>("/api/auth/login/", { email, password });
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post<void>("/api/auth/logout/");
    } finally {
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api.get<User>("/api/auth/me/");
    setUser(u);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser }}
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
