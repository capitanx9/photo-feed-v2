// AI generation client. Same shape as src/lib/upload.ts (kick off,
// poll until ready, hand back a media_id). The kick-off returns a job
// id; polling GET /api/ai/jobs/<id>/ surfaces the presigned URLs of
// each variant. approve() then materialises a chosen variant as a
// ready PostMedia in photo-feed-uploads.

import {
  api,
  type GenerationCreateResponse,
  type GenerationJob,
  type PostMedia,
} from "./api";

export class GenerationError extends Error {}

export async function startGeneration(prompt: string): Promise<number> {
  const res = await api.post<GenerationCreateResponse>("/api/ai/generate/", {
    prompt,
    variants_count: 4,
  });
  return res.job_id;
}

export async function waitForGeneration(
  jobId: number,
  {
    timeoutMs = 120_000,
    intervalMs = 2_000,
  }: {
    timeoutMs?: number;
    intervalMs?: number;
  } = {},
): Promise<GenerationJob> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await api.get<GenerationJob>(`/api/ai/jobs/${jobId}/`);
    if (job.status === "ready") return job;
    if (job.status === "failed") {
      throw new GenerationError(job.error || "Generation failed");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new GenerationError("Timed out waiting for generation");
}

export async function approveVariant(
  jobId: number,
  variantIndex: number,
): Promise<PostMedia> {
  return api.post<PostMedia>(`/api/ai/jobs/${jobId}/approve/`, {
    variant_index: variantIndex,
  });
}
