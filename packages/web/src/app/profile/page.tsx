"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ApiFetchError, api, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { UploadError, uploadFile, waitForMediaReady } from "@/lib/upload";

export default function ProfilePage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "uploading" }
    | { kind: "processing"; mediaId: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // let the user re-pick the same file after an error

    setStatus({ kind: "uploading" });
    try {
      const { mediaId } = await uploadFile(file, "avatar");
      setStatus({ kind: "processing", mediaId });
      await waitForMediaReady(mediaId);
      await api.patch<User>("/api/auth/me/", { avatar_media_id: mediaId });
      await refreshUser();
      setStatus({ kind: "idle" });
    } catch (err) {
      const message =
        err instanceof UploadError
          ? err.message
          : err instanceof ApiFetchError
            ? (err.data.detail as string) || `HTTP ${err.status}`
            : "Upload failed";
      setStatus({ kind: "error", message });
    }
  }

  if (loading || !user) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-4 py-16">
        <p className="text-zinc-500">Loading…</p>
      </main>
    );
  }

  const busy = status.kind === "uploading" || status.kind === "processing";
  const avatarUrl = user.avatar?.url ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Profile</h1>

      <section className="flex items-start gap-6">
        <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-black/[.08] bg-zinc-100 dark:border-white/[.145] dark:bg-zinc-900">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-4xl text-zinc-400">
              {user.email.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-500">Signed in as</p>
          <p className="font-medium">{user.email}</p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={handleFile}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm hover:bg-black/[.04] disabled:opacity-60 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            {status.kind === "uploading"
              ? "Uploading…"
              : status.kind === "processing"
                ? "Processing…"
                : "Change avatar"}
          </button>

          {status.kind === "error" && (
            <p aria-live="polite" className="text-sm text-red-600">
              {status.message}
            </p>
          )}
          <p className="text-xs text-zinc-500">
            JPEG / PNG / WebP · up to 10&nbsp;MB · cropped to 512×512
          </p>
        </div>
      </section>
    </main>
  );
}
