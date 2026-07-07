"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function Navbar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-black/[.08] dark:border-white/[.145]">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          photo-feed
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {loading ? (
            <span className="text-zinc-500">…</span>
          ) : user ? (
            <>
              <Link
                href="/profile"
                className="text-zinc-600 hover:text-foreground dark:text-zinc-300"
              >
                {user.email}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-black/[.08] px-3 py-1 hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3 py-1 hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-foreground px-3 py-1 text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
