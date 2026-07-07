// Thin fetch wrapper for the Django backend.
// All requests are same-origin (nginx proxies /api/* to Django in prod,
// next.config.ts rewrites in dev) so the browser sends and receives
// HttpOnly JWT cookies automatically. Every call sets credentials:'include'
// as a belt-and-braces guard against a future cross-origin split.

export type ApiError = { detail?: string; [field: string]: unknown };

export class ApiFetchError extends Error {
  status: number;
  data: ApiError;
  constructor(status: number, data: ApiError) {
    super(data.detail ?? `HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as ApiError;
  if (!res.ok) throw new ApiFetchError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export type UserAvatar = {
  id: number;
  kind: "post" | "avatar";
  status: "pending" | "ready" | "failed";
  url: string | null;
  created_at: string;
};

export type User = {
  id: number;
  email: string;
  avatar: UserAvatar | null;
};

export type PostMedia = {
  id: number;
  kind: "post" | "avatar";
  status: "pending" | "ready" | "failed";
  url: string | null;
  created_at: string;
};

export type Post = {
  id: number;
  owner_id: number;
  caption: string;
  price: string | null;
  status: "draft" | "published";
  media: PostMedia[];
  created_at: string;
};

export type Page<T> = {
  next: string | null;
  previous: string | null;
  results: T[];
};

export type GenerationStatus = "queued" | "running" | "ready" | "failed";

export type GenerationJob = {
  id: number;
  prompt: string;
  variants_count: number;
  aspect_ratio: string;
  status: GenerationStatus;
  image_urls: string[];
  error: string;
  created_at: string;
  updated_at: string;
};

export type GenerationCreateResponse = {
  job_id: number;
  status_url: string;
};

export type CartItem = {
  id: number;
  post_id: number;
  qty: number;
  price: string;
  line_total: number | string;
  created_at: string;
};

export type Cart = {
  id: number;
  items: CartItem[];
  total: string;
  updated_at: string;
};
