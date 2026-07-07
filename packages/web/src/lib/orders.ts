// Client-side helpers for the orders endpoints.
//
// waitForOrderConfirm hits the long-polling endpoint that blocks server-side
// (via Redis pubsub) for up to ~25 seconds waiting for admin action on a
// pending order. It resolves with the current Order snapshot regardless of
// whether the status transitioned — the caller decides whether to reconnect.

import { api, type Order } from "./api";

export function waitForOrderConfirm(id: number): Promise<Order> {
  return api.get<Order>(`/api/orders/${id}/wait-confirm/`);
}
