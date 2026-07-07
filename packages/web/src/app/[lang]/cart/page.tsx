"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiFetchError, api, type Cart, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHref, useT } from "@/lib/i18n";

export default function CartPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useT();
  const href = useHref();
  const [cart, setCart] = useState<Cart | null>(null);
  const [posts, setPosts] = useState<Record<number, Post>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace(href("/login"));
  }, [authLoading, user, router, href]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await api.get<Cart>("/api/cart/");
      setCart(c);
      const postsById: Record<number, Post> = {};
      await Promise.all(
        c.items.map(async (item) => {
          try {
            const p = await api.get<Post>(`/api/posts/${item.post_id}/`);
            postsById[item.post_id] = p;
          } catch {
            // Missing post is fine — item shows with a placeholder.
          }
        }),
      );
      setPosts(postsById);
    } catch (err) {
      setError(
        err instanceof ApiFetchError
          ? (err.data.detail as string) || `HTTP ${err.status}`
          : t("cart.failedLoad"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) load();
  }, [user, load]);

  async function updateQty(itemId: number, qty: number) {
    if (qty < 1) return;
    setBusyItemId(itemId);
    try {
      await api.patch(`/api/cart/items/${itemId}/`, { qty });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiFetchError
          ? (err.data.detail as string) || `HTTP ${err.status}`
          : t("cart.failedUpdate"),
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function removeItem(itemId: number) {
    setBusyItemId(itemId);
    try {
      await api.delete(`/api/cart/items/${itemId}/`);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiFetchError
          ? (err.data.detail as string) || `HTTP ${err.status}`
          : t("cart.failedRemove"),
      );
    } finally {
      setBusyItemId(null);
    }
  }

  if (authLoading || !user || loading) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-16">
        <p className="text-zinc-500">{t("common.loading")}</p>
      </main>
    );
  }

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t("cart.title")}</h1>

      {error && (
        <p aria-live="polite" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-black/[.12] p-8 text-center dark:border-white/[.2]">
          <p className="text-zinc-500">{t("cart.empty")}</p>
          <Link href={href("/")} className="mt-3 inline-block underline">
            {t("cart.browseFeed")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col divide-y divide-black/[.08] rounded-lg border border-black/[.08] dark:divide-white/[.145] dark:border-white/[.145]">
            {cart!.items.map((item) => {
              const post = posts[item.post_id];
              const cover = post?.media.find(
                (m) => m.status === "ready" && m.url,
              );
              const busy = busyItemId === item.id;
              return (
                <li key={item.id} className="flex items-center gap-4 p-4">
                  <Link
                    href={href(`/posts/${item.post_id}`)}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900"
                  >
                    {cover?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover.url}
                        alt={post?.caption || `Post #${item.post_id}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                        #{item.post_id}
                      </div>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={href(`/posts/${item.post_id}`)}
                      className="line-clamp-1 text-sm font-medium hover:underline"
                    >
                      {post?.caption || `Post #${item.post_id}`}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      €{item.price} {t("cart.each")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQty(item.id, item.qty - 1)}
                      disabled={busy || item.qty <= 1}
                      aria-label={t("cart.decrease")}
                      className="h-7 w-7 rounded-full border border-black/[.08] hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm">{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      disabled={busy}
                      aria-label={t("cart.increase")}
                      className="h-7 w-7 rounded-full border border-black/[.08] hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                    >
                      +
                    </button>
                  </div>

                  <p className="w-20 text-right text-sm font-medium">
                    €{item.line_total}
                  </p>

                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={busy}
                    className="ml-2 text-xs text-zinc-500 underline hover:text-red-600 disabled:opacity-40"
                  >
                    {t("cart.remove")}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
            <span className="text-sm text-zinc-500">{t("cart.total")}</span>
            <span className="text-2xl font-semibold">€{cart!.total}</span>
          </div>

          <div className="flex justify-end">
            <Link
              href={href("/checkout")}
              className="rounded-full bg-foreground px-6 py-2 text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              {t("cart.checkout")}
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
