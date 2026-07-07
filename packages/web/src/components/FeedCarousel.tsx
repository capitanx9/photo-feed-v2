"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Post } from "@/lib/api";
import { useHref, useT } from "@/lib/i18n";

const AUTO_ADVANCE_MS = 5000;

type Props = {
  posts: Post[];
  nextUrl: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  onExit: () => void;
};

// Full-screen carousel that flips through the feed one post at a time.
// Auto-advances every 5s; pauses on hover or when the tab is hidden.
// When we hit the tail of the loaded list and there is a next page,
// we prefetch it — the parent owns pagination, we just call onLoadMore.
export function FeedCarousel({
  posts,
  nextUrl,
  loadingMore,
  onLoadMore,
  onExit,
}: Props) {
  const t = useT();
  const router = useRouter();
  const href = useHref();
  const [idx, setIdx] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const count = posts.length;
  // Clamp when the underlying list shrinks (shouldn't happen in practice,
  // but guards against out-of-bounds if the parent ever replaces posts).
  const safeIdx = count === 0 ? 0 : Math.min(idx, count - 1);
  const current = posts[safeIdx];

  const goNext = useCallback(() => {
    if (count === 0) return;
    setIdx((i) => {
      const next = i + 1;
      if (next < count) return next;
      // At the tail: if there's another page, hold position and fetch —
      // once the parent appends results, the next tick moves forward.
      if (nextUrl) return i;
      return 0; // loop
    });
    // Kick off pagination when we're one away from the end, so the next
    // image is ready by the time the tick lands.
    if (nextUrl && !loadingMore && idx >= count - 2) {
      onLoadMore();
    }
  }, [count, idx, nextUrl, loadingMore, onLoadMore]);

  const goPrev = useCallback(() => {
    if (count === 0) return;
    setIdx((i) => (i > 0 ? i - 1 : count - 1));
  }, [count]);

  const openCurrent = useCallback(() => {
    if (!current) return;
    onExit();
    router.push(href(`/posts/${current.id}`));
  }, [current, onExit, router, href]);

  // Auto-advance timer. Kept in a ref so we can clear it on every
  // dependency change without tripping react-hooks/set-state-in-effect.
  useEffect(() => {
    if (hovering || tabHidden || count === 0) return;
    intervalRef.current = window.setInterval(goNext, AUTO_ADVANCE_MS);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hovering, tabHidden, count, goNext]);

  // Pause when the tab is not visible.
  useEffect(() => {
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onExit();
      } else if (e.key === "Enter") {
        e.preventDefault();
        openCurrent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, onExit, openCurrent]);

  // Lock body scroll while the overlay owns the viewport.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!current) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-zinc-300">
        <p>{t("feed.empty")}</p>
        <button
          type="button"
          onClick={onExit}
          className="ml-4 rounded-full border border-white/20 px-3 py-1 text-sm hover:bg-white/10"
        >
          {t("feed.carousel.exit")}
        </button>
      </div>
    );
  }

  const readyMedia = current.media.filter((m) => m.status === "ready" && m.url);
  const cover = readyMedia[0] ?? null;
  const paused = hovering || tabHidden;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={t("feed.carousel.toggle")}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span className="opacity-80">
          {safeIdx + 1} / {count}
          {loadingMore ? ` · ${t("feed.loadingMore")}` : ""}
        </span>
        <div className="flex items-center gap-3">
          {paused && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
              {t("feed.carousel.paused")}
            </span>
          )}
          <span className="hidden text-xs opacity-70 sm:inline">
            {t("feed.carousel.exitHint")}
          </span>
          <button
            type="button"
            onClick={openCurrent}
            className="rounded-full border border-white/20 px-3 py-1 text-sm hover:bg-white/10"
          >
            {t("feed.carousel.openPost")}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-full border border-white/20 px-3 py-1 text-sm hover:bg-white/10"
            aria-label={t("feed.carousel.exit")}
          >
            {t("feed.carousel.exit")}
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <button
          type="button"
          onClick={goPrev}
          aria-label={t("feed.carousel.prev")}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-2xl hover:bg-white/20"
        >
          &lsaquo;
        </button>
        <button
          type="button"
          onClick={openCurrent}
          aria-label={t("feed.carousel.openPost")}
          className="mx-auto flex max-h-full w-full max-w-4xl cursor-pointer flex-col items-center gap-4 px-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <div className="flex max-h-[70vh] w-full items-center justify-center">
            {cover ? (
              // Presigned S3 URL — must be a plain <img>, not next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover.url!}
                alt={current.caption || `Post #${current.id}`}
                className="max-h-[70vh] max-w-full object-contain"
              />
            ) : (
              <div className="flex h-[50vh] w-full items-center justify-center bg-white/5 text-zinc-400">
                {t("feed.noImage")}
              </div>
            )}
          </div>
          <div className="w-full text-center">
            <p className="mx-auto max-w-2xl whitespace-pre-line text-lg">
              {current.caption || (
                <span className="text-zinc-400">{t("feed.untitled")}</span>
              )}
            </p>
            <div className="mt-2 flex items-center justify-center gap-4 text-sm text-zinc-300">
              <span>#{current.id}</span>
              {current.price && (
                <span className="font-medium text-white">&euro;{current.price}</span>
              )}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label={t("feed.carousel.next")}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-2xl hover:bg-white/20"
        >
          &rsaquo;
        </button>
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="mx-auto flex max-w-4xl items-center gap-1">
          {posts.map((p, i) => (
            <span
              key={p.id}
              aria-hidden="true"
              className={`h-1 flex-1 rounded-full transition-colors ${
                i === safeIdx
                  ? "bg-white"
                  : i < safeIdx
                    ? "bg-white/50"
                    : "bg-white/15"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
