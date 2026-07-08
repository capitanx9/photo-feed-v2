"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ApiFetchError, api, type Post, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHref, useT } from "@/lib/i18n";
import { TTS_MIN_CAPTION_CHARS, synthesizeCaption } from "@/lib/tts";

export default function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user: me } = useAuth();
  const router = useRouter();
  const t = useT();
  const href = useHref();

  const [post, setPost] = useState<Post | null>(null);
  const [owner, setOwner] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cartStatus, setCartStatus] = useState<
    | { kind: "idle" }
    | { kind: "adding" }
    | { kind: "added" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [ttsState, setTtsState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; url: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await api.get<Post>(`/api/posts/${id}/`);
        if (cancelled) return;
        setPost(p);
        setActiveIdx(0);
        try {
          const o = await api.get<User>(`/api/users/${p.owner_id}/`);
          if (!cancelled) setOwner(o);
        } catch {
          // Owner lookup is optional decoration; a missing user
          // shouldn't hide the post.
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiFetchError
            ? err.status === 404
              ? t("post.notFound")
              : (err.data.detail as string) || `HTTP ${err.status}`
            : t("post.loadFailed"),
        );
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  async function handleSpeakCaption() {
    if (!post) return;
    if (!me) {
      router.push(href("/login"));
      return;
    }
    setTtsState({ kind: "loading" });
    try {
      const { audio_url } = await synthesizeCaption(post.id);
      setTtsState({ kind: "ready", url: audio_url });
    } catch (err) {
      setTtsState({
        kind: "error",
        message:
          err instanceof ApiFetchError
            ? (err.data.detail as string) || `HTTP ${err.status}`
            : t("post.ttsFailed"),
      });
    }
  }

  async function handleAddToCart() {
    if (!me) {
      router.push(href("/login"));
      return;
    }
    if (!post) return;
    setCartStatus({ kind: "adding" });
    try {
      await api.post("/api/cart/items/", { post_id: post.id, qty: 1 });
      setCartStatus({ kind: "added" });
    } catch (err) {
      setCartStatus({
        kind: "error",
        message:
          err instanceof ApiFetchError
            ? (err.data.detail as string) || `HTTP ${err.status}`
            : t("post.loadFailed"),
      });
    }
  }

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-16">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }
  if (!post) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-16">
        <p className="text-zinc-500">{t("common.loading")}</p>
      </main>
    );
  }

  const readyMedia = post.media.filter((m) => m.status === "ready" && m.url);
  const active = readyMedia[activeIdx] ?? readyMedia[0] ?? null;
  const isOwner = me?.id === post.owner_id;

  return (
    <main className="mx-auto grid w-full max-w-4xl flex-1 grid-cols-1 gap-8 px-4 py-8 md:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex flex-col gap-3">
        <div className="aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
          {active ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active.url!}
              alt={post.caption || `Post #${post.id}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
              {t("feed.noImage")}
            </div>
          )}
        </div>
        {readyMedia.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {readyMedia.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded border ${
                  i === activeIdx
                    ? "border-foreground"
                    : "border-black/[.08] dark:border-white/[.145]"
                }`}
                aria-label={`View media ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url!}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            {t("post.author")}
          </p>
          {owner ? (
            <span className="text-sm">{owner.email}</span>
          ) : (
            <p className="text-sm text-zinc-400">User #{post.owner_id}</p>
          )}
        </div>

        {post.caption && (
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {t("post.caption")}
            </p>
            <p className="whitespace-pre-line text-sm">{post.caption}</p>
            {post.caption.trim().length >= TTS_MIN_CAPTION_CHARS && (
              <div className="mt-2 flex flex-col gap-2">
                {ttsState.kind === "ready" ? (
                  <audio
                    controls
                    autoPlay
                    src={ttsState.url}
                    className="w-full"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={handleSpeakCaption}
                    disabled={ttsState.kind === "loading"}
                    className="self-start rounded-full border border-black/[.12] px-3 py-1 text-xs hover:bg-black/[.04] disabled:opacity-60 dark:border-white/[.2] dark:hover:bg-[#1a1a1a]"
                  >
                    {ttsState.kind === "loading"
                      ? t("post.ttsLoading")
                      : t("post.speakCaption")}
                  </button>
                )}
                {ttsState.kind === "error" && (
                  <p aria-live="polite" className="text-xs text-red-600">
                    {ttsState.message}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {post.price ? (
          <div className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
            <p className="text-2xl font-semibold">€{post.price}</p>
            <button
              type="button"
              disabled={cartStatus.kind === "adding" || isOwner}
              onClick={handleAddToCart}
              className="mt-3 w-full rounded-full bg-foreground py-2 text-background hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
            >
              {isOwner
                ? t("post.yourOwn")
                : cartStatus.kind === "adding"
                  ? t("post.adding")
                  : cartStatus.kind === "added"
                    ? t("post.added")
                    : t("post.addToCart")}
            </button>
            {cartStatus.kind === "error" && (
              <p aria-live="polite" className="mt-2 text-sm text-red-600">
                {cartStatus.message}
              </p>
            )}
            {cartStatus.kind === "added" && (
              <Link
                href={href("/cart")}
                className="mt-2 block text-center text-sm underline"
              >
                {t("post.goToCart")}
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t("post.notForSale")}</p>
        )}

        <p className="text-xs text-zinc-400">
          {t("post.postedOn")} {new Date(post.created_at).toLocaleDateString()}
        </p>
      </aside>
    </main>
  );
}
