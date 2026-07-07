// Minimal in-house toast system. Framework-agnostic and dependency-free.
//
// Producers call `toast(message, type)` from anywhere (including modules
// like api.ts that must not import React). Consumers subscribe to the
// same EventTarget-backed bus. Keeping this file free of React means
// api.ts -> toast.ts stays a plain module-graph edge and avoids the
// circular dep you'd get from routing toasts through a React context.

export type ToastType = "error" | "success";

export type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

const TOAST_EVENT = "photo-feed:toast";

// A single EventTarget shared by producers and the Toaster component.
// SSR-safe: on the server we still allocate one but no one dispatches
// on it because the api helper is called from browsers.
const bus: EventTarget =
  typeof window === "undefined" ? new EventTarget() : window;

let nextId = 1;

export function toast(message: string, type: ToastType = "error"): void {
  const detail: ToastItem = { id: nextId++, message, type };
  bus.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

export function subscribeToasts(
  listener: (item: ToastItem) => void,
): () => void {
  const handler = (e: Event) => {
    const ce = e as CustomEvent<ToastItem>;
    listener(ce.detail);
  };
  bus.addEventListener(TOAST_EVENT, handler);
  return () => bus.removeEventListener(TOAST_EVENT, handler);
}
