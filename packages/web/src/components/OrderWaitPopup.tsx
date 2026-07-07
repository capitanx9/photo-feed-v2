"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { ApiFetchError, type Order } from "@/lib/api";
import { waitForOrderConfirm } from "@/lib/orders";
import { useT } from "@/lib/i18n";

// Milliseconds to wait after a network/404 error before reconnecting.
const RETRY_BACKOFF_MS = 2000;

type Props = {
  orderId: number;
  onConfirmed: (order: Order) => void;
  onCancel: () => void;
};

// Modal that long-polls /api/orders/<id>/wait-confirm/ until the order
// leaves the "pending" state, then hands the fresh Order back to the parent.
// The server holds each request open up to ~25s (Redis pubsub); we simply
// reconnect on any resolution that still shows pending, and back off 2s on
// transient errors (network, 404 while the endpoint is being rolled out).
export function OrderWaitPopup({ orderId, onConfirmed, onCancel }: Props) {
  const t = useT();
  const cancelledRef = useRef(false);

  // useEffectEvent gives us stable callbacks that always see the latest
  // props without becoming effect dependencies — the effect must run
  // exactly once per orderId or we'd double-poll.
  const emitConfirmed = useEffectEvent((order: Order) => onConfirmed(order));
  const emitCancel = useEffectEvent(() => onCancel());

  useEffect(() => {
    cancelledRef.current = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      while (!cancelledRef.current) {
        try {
          const order = await waitForOrderConfirm(orderId);
          if (cancelledRef.current) return;
          if (order.status !== "pending") {
            emitConfirmed(order);
            return;
          }
          // Still pending — loop immediately (server already blocked ~25s).
        } catch (err) {
          if (cancelledRef.current) return;
          // 404 means the endpoint isn't deployed yet; treat like a
          // transient error and back off. Any other network hiccup: same.
          const status =
            err instanceof ApiFetchError ? err.status : undefined;
          if (status !== undefined && status !== 404 && status < 500) {
            // Unexpected client error (401/403 etc.) — bail out to /orders
            // so the user isn't stuck behind an unrecoverable modal.
            emitCancel();
            return;
          }
          await new Promise<void>((resolve) => {
            retryTimer = setTimeout(() => {
              retryTimer = null;
              resolve();
            }, RETRY_BACKOFF_MS);
          });
        }
      }
    }

    void poll();

    return () => {
      cancelledRef.current = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, [orderId]);

  function handleCancel() {
    cancelledRef.current = true;
    onCancel();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-wait-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border border-black/[.08] bg-background p-6 text-center shadow-lg dark:border-white/[.145]">
        <div
          aria-hidden="true"
          className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-300 border-t-foreground dark:border-zinc-700 dark:border-t-foreground"
        />
        <h2 id="order-wait-title" className="text-lg font-semibold">
          {t("checkout.confirm.title")}
        </h2>
        <p className="text-sm text-zinc-500">
          {t("checkout.confirm.description", { id: orderId })}
        </p>
        <button
          type="button"
          onClick={handleCancel}
          className="mt-2 rounded-full border border-black/[.08] px-4 py-1.5 text-sm hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          {t("checkout.confirm.cancel")}
        </button>
      </div>
    </div>
  );
}
