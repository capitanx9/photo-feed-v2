"use client";

import { useEffect, useState } from "react";
import { subscribeToasts, type ToastItem } from "@/lib/toast";

const DISMISS_MS = 4000;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    // State mutations here happen inside event callbacks / setTimeout —
    // not during effect setup — so react-hooks/set-state-in-effect stays
    // happy.
    const unsubscribe = subscribeToasts((item) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, DISMISS_MS);
    });
    return unsubscribe;
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={
            "pointer-events-auto min-w-[220px] max-w-sm rounded-md border px-4 py-3 text-sm shadow-lg " +
            (item.type === "error"
              ? "border-red-500/30 bg-red-600 text-white"
              : "border-emerald-500/30 bg-emerald-600 text-white")
          }
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
