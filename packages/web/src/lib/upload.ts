// Two-stage upload helper used by /profile (avatar) and /posts/new (post
// media). The Django API mints a presigned S3 PUT URL and creates a
// pending PostMedia; the browser PUTs the raw bytes directly; the
// cut_image Lambda flips PostMedia.status to ready via webhook. The
// client only knows about polling GET /api/posts/media/<id>/ until
// status !== "pending".

import { api } from "./api";

export type MediaKind = "post" | "avatar";

export type Media = {
  id: number;
  kind: MediaKind;
  status: "pending" | "ready" | "failed";
  url: string | null;
  created_at: string;
};

type UploadURLResponse = {
  media_id: number;
  upload_url: string;
  s3_key: string;
  expires_in: number;
};

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

export class UploadError extends Error {}

export async function uploadFile(
  file: File,
  kind: MediaKind,
): Promise<{ mediaId: number }> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new UploadError(
      `Unsupported file type ${file.type}. Use JPEG, PNG, or WebP.`,
    );
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    throw new UploadError(
      `File must be under ${MAX_BYTES / 1024 / 1024} MB.`,
    );
  }

  const presigned = await api.post<UploadURLResponse>(
    "/api/posts/upload-url/",
    {
      content_type: file.type,
      content_length: file.size,
      kind,
    },
  );

  const putRes = await fetch(presigned.upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putRes.ok) {
    throw new UploadError(`S3 upload failed with status ${putRes.status}`);
  }

  return { mediaId: presigned.media_id };
}

// Poll /api/posts/media/<id>/ until cut_image webhook flips status.
// Backoff is a plain 1500ms interval; the Lambda usually finishes in
// under a couple of seconds and the endpoint is cheap.
export async function waitForMediaReady(
  mediaId: number,
  { timeoutMs = 60_000, intervalMs = 1_500 }: {
    timeoutMs?: number;
    intervalMs?: number;
  } = {},
): Promise<Media> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const media = await api.get<Media>(`/api/posts/media/${mediaId}/`);
    if (media.status === "ready") return media;
    if (media.status === "failed") {
      throw new UploadError("Server-side processing failed.");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new UploadError("Timed out waiting for processing.");
}
