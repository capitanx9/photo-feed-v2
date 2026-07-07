"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiFetchError, api, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHref, useT } from "@/lib/i18n";
import { MediaSlot } from "@/components/MediaSlot";

type SlotStatus =
  | { kind: "empty" }
  | { kind: "uploading" }
  | { kind: "generating" }
  | { kind: "picking"; jobId: number; urls: string[] }
  | { kind: "approving" }
  | { kind: "ready"; mediaId: number; previewUrl: string }
  | { kind: "error"; message: string };

const SLOT_COUNT = 3;

export default function NewPostPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useT();
  const href = useHref();
  const [slots, setSlots] = useState<SlotStatus[]>(
    Array.from({ length: SLOT_COUNT }, () => ({ kind: "empty" }) as SlotStatus),
  );
  const [caption, setCaption] = useState("");
  const [price, setPrice] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace(href("/login"));
  }, [loading, user, router, href]);

  function updateSlot(i: number, next: SlotStatus) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? next : s)));
  }

  const readyMediaIds = slots
    .filter((s): s is Extract<SlotStatus, { kind: "ready" }> => s.kind === "ready")
    .map((s) => s.mediaId);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (readyMediaIds.length === 0) {
      setError(t("newPost.needImage"));
      return;
    }
    setPublishing(true);
    try {
      const body: Record<string, unknown> = {
        media_ids: readyMediaIds,
        caption: caption.trim(),
      };
      if (price.trim()) body.price = price.trim();
      const post = await api.post<Post>("/api/posts/", body);
      router.push(href(`/posts/${post.id}`));
    } catch (err) {
      setError(
        err instanceof ApiFetchError
          ? (err.data.detail as string) || `HTTP ${err.status}`
          : t("newPost.failedPublish"),
      );
      setPublishing(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-16">
        <p className="text-zinc-500">{t("common.loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t("newPost.title")}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <section>
          <p className="mb-2 text-sm text-zinc-500">{t("newPost.slotsHint")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {slots.map((s, i) => (
              <MediaSlot
                key={i}
                index={i}
                status={s}
                onChange={(next) => updateSlot(i, next)}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("newPost.captionLabel")}
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder={t("newPost.captionPlaceholder")}
              className="rounded-md border border-black/[.12] bg-transparent p-2 outline-none focus:border-foreground dark:border-white/[.2]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("newPost.priceLabel")}
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="rounded-md border border-black/[.12] bg-transparent px-3 py-2 outline-none focus:border-foreground dark:border-white/[.2]"
            />
          </label>
        </section>

        {error && (
          <p aria-live="polite" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={publishing || readyMediaIds.length === 0}
          className="self-start rounded-full bg-foreground px-6 py-2 text-background hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
        >
          {publishing ? t("newPost.publishing") : t("newPost.publish")}
        </button>
      </form>
    </main>
  );
}
