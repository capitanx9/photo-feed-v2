// Browser-side speech-to-text: record a short clip via MediaRecorder,
// POST it as multipart to /api/stt/, and return the transcript.
//
// Django blocks up to STT_POLL_TIMEOUT_SECONDS (45s) waiting for
// Transcribe, and caps input at 2 MB. We match those constraints here
// with a client-side max recording length and mime preference that
// stays under the size cap on typical hardware.

import { ApiFetchError } from "./api";

export class STTError extends Error {}

export type TranscriptionResult = {
  text: string;
  language_code: string;
};

// Preferred recording MIME. Chromium/Firefox record webm/opus natively.
// Safari 14.1+ records mp4/aac via MediaRecorder. Order matters: first
// supported one wins.
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

// Server accepts these top-level MIMEs. We normalise by stripping
// codec params before posting so multer/DRF match against the map.
const NORMALISED_MIME: Record<string, string> = {
  "audio/webm": "audio/webm",
  "audio/ogg": "audio/ogg",
  "audio/mp4": "audio/mp4",
};

export function isSTTSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!("MediaRecorder" in window)) return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  return PREFERRED_MIME_TYPES.some((m) => MediaRecorder.isTypeSupported(m));
}

function pickMime(): string {
  for (const m of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  throw new STTError("Browser does not support any supported audio codec.");
}

export type RecordingSession = {
  stop: () => Promise<Blob>;
  cancel: () => void;
  mimeType: string;
};

export async function startRecording(): Promise<RecordingSession> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new STTError("Microphone access was denied.");
  }
  const mimeType = pickMime();
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  let settled = false;
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      settled = true;
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = () => {
      settled = true;
      stream.getTracks().forEach((t) => t.stop());
      reject(new STTError("Recorder failed."));
    };
  });

  return {
    mimeType,
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
      return stopped;
    },
    cancel: () => {
      if (settled) return;
      settled = true;
      if (recorder.state !== "inactive") recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

export async function transcribe(blob: Blob): Promise<TranscriptionResult> {
  if (blob.size <= 0) throw new STTError("Empty recording.");
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new STTError("Recording is too long. Keep it under ~30 seconds.");
  }

  const topLevel = (blob.type.split(";", 1)[0] ?? "").trim().toLowerCase();
  const serverMime = NORMALISED_MIME[topLevel] ?? topLevel;
  const filename = `clip.${extFor(serverMime)}`;

  const form = new FormData();
  form.append("audio", new Blob([blob], { type: serverMime }), filename);

  const res = await fetch("/api/stt/", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiFetchError(res.status, data);
  }
  return data as TranscriptionResult;
}

function extFor(mime: string): string {
  switch (mime) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "mp4";
    default:
      return "bin";
  }
}
