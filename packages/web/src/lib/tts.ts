// Browser-side helper for POST /api/posts/<id>/tts/. The Django endpoint
// runs Amazon Polly, caches the mp3 in S3, and returns a short-lived
// presigned GET URL — the browser plays that directly, Django never
// streams audio bytes.

import { api } from "./api";

// Mirrors packages/api settings.TTS_MIN_CAPTION_CHARS. Kept in sync
// manually; a mismatch just means the UI shows a button the server
// then rejects with 400, which is harmless.
export const TTS_MIN_CAPTION_CHARS = 140;

export type TTSResponse = {
  audio_url: string;
  cached: boolean;
};

export function synthesizeCaption(postId: number): Promise<TTSResponse> {
  return api.post<TTSResponse>(`/api/posts/${postId}/tts/`);
}
