// Thin fetch wrapper for the Django backend.
// All requests are same-origin (nginx proxies /api/* to Django in prod,
// next.config.ts rewrites in dev) so the browser sends and receives
// HttpOnly JWT cookies automatically. Every call sets credentials:'include'
// as a belt-and-braces guard against a future cross-origin split.

import { toast } from "./toast";

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

// Generic 5xx message. api.ts can't reach into the React i18n context,
// so we snapshot the two locales here and pick by `document.documentElement.lang`
// (set by the [lang] layout). Keeps the toast localised without pulling
// React into this module.
const SERVER_ERROR_TOAST: Record<string, string> = {
  en: "Server error. Please try again.",
  ru: "Ошибка сервера. Попробуйте ещё раз.",
};

function serverErrorToast(): string {
  const lang =
    typeof document !== "undefined" ? document.documentElement.lang : "en";
  return SERVER_ERROR_TOAST[lang] ?? SERVER_ERROR_TOAST.en;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  if (!res.ok) {
    if (res.status >= 500) {
      // Log the raw failure — production observability picks this up
      // via the browser console/Sentry, and the user gets a toast so
      // the failure isn't silent while individual callers unwind.
      console.error("api 5xx", res.status, path, data);
      toast((data.detail as string | undefined) ?? serverErrorToast(), "error");
    }
    throw new ApiFetchError(res.status, data);
  }
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

// /api/auth/login/, /api/auth/refresh/, /api/auth/me/ return the User plus
// `expires_at` — the ISO-8601 deadline of the current access-token cookie.
// The frontend schedules a session-expiring warning + auto sign-off from it
// (see AuthProvider). `avatar` may be absent on legacy responses that don't
// include the session field; treat both fields as always-present here since
// the current API always returns them.
export type SessionUser = User & { expires_at: string };

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

export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";
export type PaymentMethod = "card" | "paypal" | "crypto" | "cod";

export type OrderItem = {
  id: number;
  post_id: number;
  qty: number;
  price_at_purchase: string;
  line_total: number | string;
};

export type Order = {
  id: number;
  status: OrderStatus;
  total: string;
  payment_method: PaymentMethod;
  shipping_name: string;
  shipping_address: string;
  shipping_city: string;
  shipping_zip: string;
  shipping_country: string;
  items: OrderItem[];
  created_at: string;
};
