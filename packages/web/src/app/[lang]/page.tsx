"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiFetchError, api, type Page, type Post } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { FeedCarousel } from "@/components/FeedCarousel";
import { PostCard } from "@/components/PostCard";

const FEED_PAGE_PATH = "/api/posts/";
const SCROLL_MODE_KEY = "photo-feed:scroll-mode";
type Mode = "infinite" | "manual";

// The DRF paginator returns `next` as an absolute URL that includes the
// domain and query string. We strip the origin so our fetch stays
// same-origin and goes through nginx.
function toRelative(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

// Lazy initialiser reads localStorage exactly once during the first
// render on the client. Guarded for SSR — this file runs on the server
// during "next build" prerender, where `window` is undefined.
function readInitialMode(): Mode {
  if (typeof window === "undefined") return "infinite";
  const saved = window.localStorage.getItem(SCROLL_MODE_KEY);
  return saved === "manual" || saved === "infinite" ? saved : "infinite";
}

export default function Home() {
  const t = useT();
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(readInitialMode);
  const [carousel, setCarousel] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(SCROLL_MODE_KEY, mode);
  }, [mode]);

  const loadPage = useCallback(
    async (path: string, replace: boolean) => {
      const setBusy = replace ? setLoading : setLoadingMore;
      setBusy(true);
      setError(null);
      try {
        const page = await api.get<Page<Post>>(path);
        setPosts((prev) =>
          replace ? page.results : [...prev, ...page.results],
        );
        setNextUrl(page.next ? toRelative(page.next) : null);
      } catch (err) {
        const msg =
          err instanceof ApiFetchError
            ? (err.data.detail as string) || `HTTP ${err.status}`
            : t("feed.loading");
        setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  useEffect(() => {
    // Initial load is a side-effect that intentionally sets state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPage(FEED_PAGE_PATH, true);
  }, [loadPage]);

  useEffect(() => {
    if (mode !== "infinite" || !nextUrl || carousel) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loadingMore) {
          loadPage(nextUrl, false);
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mode, nextUrl, loadingMore, loadPage, carousel]);

  const handleLoadMore = useCallback(() => {
    if (nextUrl && !loadingMore) loadPage(nextUrl, false);
  }, [nextUrl, loadingMore, loadPage]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("feed.title")}</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={mode === "infinite"}
              onChange={(e) =>
                setMode(e.target.checked ? "infinite" : "manual")
              }
            />
            {t("feed.infiniteScroll")}
          </label>
          <button
            type="button"
            onClick={() => setCarousel(true)}
            disabled={posts.length === 0}
            className="rounded-full border border-black/[.08] px-3 py-1 text-sm hover:bg-black/[.04] disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            {t("feed.carousel.toggle")}
          </button>
        </div>
      </div>

      {carousel && (
        <FeedCarousel
          posts={posts}
          nextUrl={nextUrl}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
          onExit={() => setCarousel(false)}
        />
      )}

      {loading ? (
        <p className="py-16 text-center text-zinc-500">{t("feed.loading")}</p>
      ) : error ? (
        <p className="py-16 text-center text-red-600">{error}</p>
      ) : posts.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">{t("feed.empty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>

          {nextUrl && mode === "infinite" && (
            <div
              ref={sentinelRef}
              className="py-6 text-center text-sm text-zinc-500"
            >
              {loadingMore ? t("feed.loadingMore") : ""}
            </div>
          )}
          {nextUrl && mode === "manual" && (
            <div className="py-6 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => loadPage(nextUrl, false)}
                className="rounded-full border border-black/[.08] px-4 py-2 text-sm hover:bg-black/[.04] disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                {loadingMore ? t("feed.loadingMore") : t("feed.loadMore")}
              </button>
            </div>
          )}
          {!nextUrl && posts.length > 0 && (
            <p className="py-6 text-center text-sm text-zinc-400">
              {t("feed.endOfFeed")}
            </p>
          )}
        </>
      )}
    </main>
  );
}
