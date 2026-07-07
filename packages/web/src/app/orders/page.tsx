"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ApiFetchError, api, type Order, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const ORDERS_PATH = "/api/orders/";

function toRelative(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function OrdersInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = Number(searchParams.get("highlight")) || null;

  const [orders, setOrders] = useState<Order[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const loadPage = useCallback(async (path: string, replace: boolean) => {
    const setBusy = replace ? setLoading : setLoadingMore;
    setBusy(true);
    setError(null);
    try {
      const page = await api.get<Page<Order>>(path);
      setOrders((prev) =>
        replace ? page.results : [...prev, ...page.results],
      );
      setNextUrl(page.next ? toRelative(page.next) : null);
    } catch (err) {
      setError(
        err instanceof ApiFetchError
          ? (err.data.detail as string) || `HTTP ${err.status}`
          : "Failed to load orders",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) loadPage(ORDERS_PATH, true);
  }, [user, loadPage]);

  if (authLoading || !user || loading) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-16">
        <p className="text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Orders</h1>

      {highlightId && (
        <div className="mb-4 rounded-md border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-800 dark:text-green-300">
          Order #{highlightId} placed. It&rsquo;s the first row below.
        </div>
      )}

      {error && (
        <p aria-live="polite" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/[.12] p-8 text-center dark:border-white/[.2]">
          <p className="text-zinc-500">You haven&rsquo;t placed any orders yet.</p>
          <Link href="/" className="mt-3 inline-block underline">
            Browse the feed
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              highlighted={o.id === highlightId}
            />
          ))}
        </ul>
      )}

      {nextUrl && (
        <div className="py-6 text-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => loadPage(nextUrl, false)}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm hover:bg-black/[.04] disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </main>
  );
}

function OrderRow({
  order,
  highlighted,
}: {
  order: Order;
  highlighted: boolean;
}) {
  const [open, setOpen] = useState(highlighted);
  const totalItems = order.items.reduce((n, it) => n + it.qty, 0);

  return (
    <li
      className={`rounded-lg border p-4 ${
        highlighted
          ? "border-green-600/50 bg-green-600/[.03]"
          : "border-black/[.08] dark:border-white/[.145]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">Order #{order.id}</p>
          <p className="text-xs text-zinc-500">
            {new Date(order.created_at).toLocaleString()} · {totalItems} item
            {totalItems === 1 ? "" : "s"} · {order.payment_method}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={order.status} />
          <span className="whitespace-nowrap text-lg font-semibold">
            €{order.total}
          </span>
          <span className="text-xs text-zinc-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-black/[.06] pt-3 dark:border-white/[.1]">
          <ul className="flex flex-col gap-1 text-sm">
            {order.items.map((it) => (
              <li key={it.id} className="flex justify-between gap-2">
                <Link
                  href={`/posts/${it.post_id}`}
                  className="hover:underline"
                >
                  Post #{it.post_id} × {it.qty}
                </Link>
                <span>€{it.line_total}</span>
              </li>
            ))}
          </ul>
          <address className="text-xs not-italic text-zinc-500">
            Shipping to <strong>{order.shipping_name}</strong>,{" "}
            {order.shipping_address}, {order.shipping_city} {order.shipping_zip}
            {order.shipping_country ? `, ${order.shipping_country}` : ""}
          </address>
        </div>
      )}
    </li>
  );
}

function StatusPill({ status }: { status: Order["status"] }) {
  const map: Record<Order["status"], string> = {
    paid: "bg-green-600/15 text-green-800 dark:text-green-300",
    shipped: "bg-blue-600/15 text-blue-800 dark:text-blue-300",
    cancelled: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs capitalize ${map[status]}`}
    >
      {status}
    </span>
  );
}

export default function OrdersPage() {
  // useSearchParams needs a Suspense boundary above it per Next 16.
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-16">
          <p className="text-zinc-500">Loading…</p>
        </main>
      }
    >
      <OrdersInner />
    </Suspense>
  );
}
