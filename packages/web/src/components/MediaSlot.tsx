"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ApiFetchError } from "@/lib/api";
import {
  GenerationError,
  approveVariant,
  startGeneration,
  waitForGeneration,
} from "@/lib/ai";
import { useT } from "@/lib/i18n";
import {
  UploadError,
  uploadFile,
  waitForMediaReady,
} from "@/lib/upload";

type SlotStatus =
  | { kind: "empty" }
  | { kind: "uploading" }
  | { kind: "generating" }
  | { kind: "picking"; jobId: number; urls: string[] }
  | { kind: "approving" }
  | { kind: "ready"; mediaId: number; previewUrl: string }
  | { kind: "error"; message: string };

type Props = {
  index: number;
  status: SlotStatus;
  onChange: (status: SlotStatus) => void;
};

export function MediaSlot({ index, status, onChange }: Props) {
  const t = useT();
  const [mode, setMode] = useState<"upload" | "ai">("upload");
  const [prompt, setPrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    onChange({ kind: "uploading" });
    try {
      const { mediaId } = await uploadFile(file, "post");
      const media = await waitForMediaReady(mediaId);
      onChange({
        kind: "ready",
        mediaId,
        previewUrl: media.url ?? URL.createObjectURL(file),
      });
    } catch (err) {
      onChange({ kind: "error", message: describe(err) });
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;
    onChange({ kind: "generating" });
    try {
      const jobId = await startGeneration(prompt.trim());
      const job = await waitForGeneration(jobId);
      onChange({ kind: "picking", jobId, urls: job.image_urls });
    } catch (err) {
      onChange({ kind: "error", message: describe(err) });
    }
  }

  async function handlePick(variantIndex: number) {
    if (status.kind !== "picking") return;
    const url = status.urls[variantIndex];
    const jobId = status.jobId;
    onChange({ kind: "approving" });
    try {
      const media = await approveVariant(jobId, variantIndex);
      onChange({
        kind: "ready",
        mediaId: media.id,
        previewUrl: media.url ?? url,
      });
    } catch (err) {
      onChange({ kind: "error", message: describe(err) });
    }
  }

  function reset() {
    onChange({ kind: "empty" });
    setPrompt("");
  }

  const busy =
    status.kind === "uploading" ||
    status.kind === "generating" ||
    status.kind === "approving";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-3 dark:border-white/[.145]">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          {t("newPost.slot")} {index + 1}
        </span>
        {status.kind !== "empty" && (
          <button
            type="button"
            onClick={reset}
            className="underline hover:no-underline"
          >
            {t("newPost.reset")}
          </button>
        )}
      </div>

      <div className="relative aspect-square overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
        {status.kind === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={status.previewUrl}
            alt={`Slot ${index + 1}`}
            className="h-full w-full object-cover"
          />
        ) : status.kind === "picking" ? (
          <div className="grid h-full w-full grid-cols-2 gap-1 p-1">
            {status.urls.map((u, i) => (
              <button
                key={u}
                type="button"
                onClick={() => handlePick(i)}
                className="overflow-hidden rounded border border-transparent hover:border-foreground"
                aria-label={`Pick variant ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u}
                  alt={`Variant ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center text-xs text-zinc-500">
            {status.kind === "uploading" && t("newPost.uploadingProcessing")}
            {status.kind === "generating" && t("newPost.generating")}
            {status.kind === "approving" && t("newPost.approving")}
            {status.kind === "empty" && t("newPost.empty")}
            {status.kind === "error" && (
              <span className="text-red-600">{status.message}</span>
            )}
          </div>
        )}
      </div>

      {status.kind === "empty" || status.kind === "error" ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`flex-1 rounded-full border px-2 py-1 ${
                mode === "upload"
                  ? "border-foreground"
                  : "border-black/[.08] dark:border-white/[.145]"
              }`}
            >
              {t("newPost.upload")}
            </button>
            <button
              type="button"
              onClick={() => setMode("ai")}
              className={`flex-1 rounded-full border px-2 py-1 ${
                mode === "ai"
                  ? "border-foreground"
                  : "border-black/[.08] dark:border-white/[.145]"
              }`}
            >
              {t("newPost.ai")}
            </button>
          </div>
          {mode === "upload" ? (
            <>
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
                className="rounded-full border border-black/[.08] py-1 text-sm hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                {t("newPost.chooseFile")}
              </button>
            </>
          ) : (
            <>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t("newPost.prompt")}
                rows={2}
                className="rounded border border-black/[.12] bg-transparent p-2 text-xs outline-none focus:border-foreground dark:border-white/[.2]"
              />
              <button
                type="button"
                disabled={busy || !prompt.trim()}
                onClick={handleGenerate}
                className="rounded-full bg-foreground py-1 text-sm text-background hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
              >
                {t("newPost.generateVariants")}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function describe(err: unknown): string {
  if (err instanceof UploadError) return err.message;
  if (err instanceof GenerationError) return err.message;
  if (err instanceof ApiFetchError) {
    return (err.data.detail as string) || `HTTP ${err.status}`;
  }
  return "Something went wrong";
}
