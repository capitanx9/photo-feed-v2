"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiFetchError, api, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHref, useT } from "@/lib/i18n";
import { MediaSlot } from "@/components/MediaSlot";
import {
  fieldBorder,
  hasErrors,
  isValidOptionalPrice,
  type FieldErrors,
} from "@/lib/validation";

type SlotStatus =
  | { kind: "empty" }
  | { kind: "uploading" }
  | { kind: "generating" }
  | { kind: "picking"; jobId: number; urls: string[] }
  | { kind: "approving" }
  | { kind: "ready"; mediaId: number; previewUrl: string }
  | { kind: "error"; message: string };

const SLOT_COUNT = 3;
const CAPTION_MAX = 500;

type NewPostField = "caption" | "price";

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
  const [errors, setErrors] = useState<FieldErrors<NewPostField>>({});
  const [publishing, setPublishing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace(href("/login"));
  }, [loading, user, router, href]);

  function updateSlot(i: number, next: SlotStatus) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? next : s)));
  }

  const readyMediaIds = slots
    .filter(
      (s): s is Extract<SlotStatus, { kind: "ready" }> => s.kind === "ready",
    )
    .map((s) => s.mediaId);

  function validate(): FieldErrors<NewPostField> {
    const e: FieldErrors<NewPostField> = {};
    if (caption.trim().length > CAPTION_MAX)
      e.caption = t("validation.captionMax");
    if (!isValidOptionalPrice(price)) e.price = t("validation.priceInvalid");
    return e;
  }

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setApiError(null);
    if (readyMediaIds.length === 0) {
      setApiError(t("newPost.needImage"));
      return;
    }
    const nextErrors = validate();
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;
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
      setApiError(
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

  // Any slot mid-flight blocks Publish. Otherwise a fast click after
  // the first slot becomes `ready` would ship the post with only that
  // one media, orphaning the still-uploading second/third slot (they
  // land as PostMedia rows with post=null and get GC'd later).
  const inflight = slots.some(
    (s) =>
      s.kind === "uploading" ||
      s.kind === "generating" ||
      s.kind === "approving" ||
      s.kind === "picking",
  );
  const disabled =
    publishing || readyMediaIds.length === 0 || inflight || hasErrors(errors);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t("newPost.title")}</h1>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
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
              onChange={(ev) => {
                setCaption(ev.target.value);
                if (errors.caption)
                  setErrors((prev) => ({ ...prev, caption: undefined }));
              }}
              rows={3}
              placeholder={t("newPost.captionPlaceholder")}
              aria-invalid={errors.caption ? true : undefined}
              className={`${fieldBorder(errors.caption)} px-2 py-2`}
            />
            <span className="flex justify-between text-xs">
              <span className="text-red-600">{errors.caption ?? ""}</span>
              <span className="text-zinc-500">
                {caption.trim().length}/{CAPTION_MAX}
              </span>
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("newPost.priceLabel")}
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(ev) => {
                setPrice(ev.target.value);
                if (errors.price)
                  setErrors((prev) => ({ ...prev, price: undefined }));
              }}
              placeholder="0.00"
              aria-invalid={errors.price ? true : undefined}
              className={fieldBorder(errors.price)}
            />
            {errors.price && (
              <span className="text-xs text-red-600">{errors.price}</span>
            )}
          </label>
        </section>

        {apiError && (
          <p
            aria-live="polite"
            role="alert"
            className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-600"
          >
            {apiError}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <button
            type="submit"
            disabled={disabled}
            className="self-start rounded-full bg-foreground px-6 py-2 text-background hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
          >
            {publishing ? t("newPost.publishing") : t("newPost.publish")}
          </button>
          {inflight && !publishing && (
            <span className="text-xs text-zinc-500">
              {t("newPost.waitForSlots")}
            </span>
          )}
        </div>
      </form>
    </main>
  );
}
