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
