"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useLocale, useT } from "@/lib/i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function Navbar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const prefix = `/${locale}`;

  async function handleLogout() {
    await logout();
    router.push(`${prefix}/login`);
    router.refresh();
  }

  return (
    <header className="border-b border-black/[.08] dark:border-white/[.145]">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href={prefix} className="text-lg font-semibold tracking-tight">
          {t("nav.brand")}
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <LocaleSwitcher />
          {loading ? (
            <span className="text-zinc-500">…</span>
          ) : user ? (
            <>
              <Link
                href={`${prefix}/posts/new`}
                className="rounded-full bg-foreground px-3 py-1 text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                {t("nav.newPost")}
              </Link>
              <Link
                href={`${prefix}/cart`}
                className="rounded-full px-3 py-1 hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
              >
                {t("nav.cart")}
              </Link>
              <Link
                href={`${prefix}/orders`}
                className="rounded-full px-3 py-1 hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
              >
                {t("nav.orders")}
              </Link>
              <Link
                href={`${prefix}/profile`}
                className="text-zinc-600 hover:text-foreground dark:text-zinc-300"
              >
                {user.email}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-black/[.08] px-3 py-1 hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <>
              <Link
                href={`${prefix}/login`}
                className="rounded-full px-3 py-1 hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]"
              >
                {t("nav.login")}
              </Link>
              <Link
                href={`${prefix}/register`}
                className="rounded-full bg-foreground px-3 py-1 text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                {t("nav.register")}
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
