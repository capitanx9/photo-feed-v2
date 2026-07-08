"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApiFetchError,
  api,
  type Cart,
  type Order,
  type PaymentMethod,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHref, useT } from "@/lib/i18n";
import { fieldBorder, hasErrors, type FieldErrors } from "@/lib/validation";
import { OrderWaitPopup } from "@/components/OrderWaitPopup";

const PAYMENT_METHOD_KEYS: PaymentMethod[] = [
  "card",
  "paypal",
  "crypto",
  "cod",
];

type CheckoutField = "name" | "address" | "city" | "zip";

export default function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useT();
  const href = useHref();
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [errors, setErrors] = useState<FieldErrors<CheckoutField>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace(href("/login"));
  }, [authLoading, user, router, href]);

  const load = useCallback(async () => {
    try {
      const c = await api.get<Cart>("/api/cart/");
      setCart(c);
    } catch (err) {
      setApiError(
        err instanceof ApiFetchError
          ? (err.data.detail as string) || `HTTP ${err.status}`
          : t("checkout.failedLoad"),
      );
    } finally {
      setCartLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) load();
  }, [user, load]);

  function validate(): FieldErrors<CheckoutField> {
    const e: FieldErrors<CheckoutField> = {};
    if (!name.trim()) e.name = t("validation.required");
    if (!address.trim()) e.address = t("validation.required");
    if (!city.trim()) e.city = t("validation.required");
    const zipTrimmed = zip.trim();
    if (!zipTrimmed) e.zip = t("validation.required");
    else if (zipTrimmed.length < 3) e.zip = t("validation.zipMin");
    return e;
  }

  function clearFieldError(field: CheckoutField) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setApiError(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;
    setSubmitting(true);
    try {
      const order = await api.post<Order>("/api/orders/checkout/", {
        payment_method: paymentMethod,
        shipping_name: name.trim(),
        shipping_address: address.trim(),
        shipping_city: city.trim(),
        shipping_zip: zip.trim(),
        shipping_country: country.trim(),
      });
      if (order.status === "pending") {
        // Open the wait-for-confirmation popup; keep the form disabled
        // while the popup polls the server.
        setPendingOrderId(order.id);
      } else {
        router.push(href(`/orders?highlight=${order.id}`));
      }
    } catch (err) {
      setApiError(
        err instanceof ApiFetchError
          ? (err.data.detail as string) || `HTTP ${err.status}`
          : t("checkout.failedPlace"),
      );
      setSubmitting(false);
    }
  }

  function handleConfirmed(order: Order) {
    setPendingOrderId(null);
    router.push(href(`/orders?highlight=${order.id}`));
  }

  function handleCancelWait() {
    setPendingOrderId(null);
    router.push(href("/orders"));
  }

  if (authLoading || !user || cartLoading) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-16">
        <p className="text-zinc-500">{t("common.loading")}</p>
      </main>
    );
  }

  const empty = !cart || cart.items.length === 0;
  if (empty) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 px-4 py-16">
        <p className="text-zinc-500">{t("checkout.empty")}</p>
        <Link href={href("/")} className="underline">
          {t("cart.browseFeed")}
        </Link>
      </main>
    );
  }

  const disabled = submitting || hasErrors(errors);

  return (
    <main className="mx-auto grid w-full max-w-4xl flex-1 grid-cols-1 gap-8 px-4 py-8 md:grid-cols-[minmax(0,1fr)_280px]">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t("checkout.title")}</h1>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            {t("checkout.shipping")}
          </h2>
          <label className="flex flex-col gap-1 text-sm">
            {t("checkout.fullName")}
            <input
              maxLength={128}
              value={name}
              onChange={(ev) => {
                setName(ev.target.value);
                clearFieldError("name");
              }}
              aria-invalid={errors.name ? true : undefined}
              className={fieldBorder(errors.name)}
            />
            {errors.name && (
              <span className="text-xs text-red-600">{errors.name}</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("checkout.address")}
            <input
              maxLength={256}
              value={address}
              onChange={(ev) => {
                setAddress(ev.target.value);
                clearFieldError("address");
              }}
              aria-invalid={errors.address ? true : undefined}
              className={fieldBorder(errors.address)}
            />
            {errors.address && (
              <span className="text-xs text-red-600">{errors.address}</span>
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              {t("checkout.city")}
              <input
                maxLength={128}
                value={city}
                onChange={(ev) => {
                  setCity(ev.target.value);
                  clearFieldError("city");
                }}
                aria-invalid={errors.city ? true : undefined}
                className={fieldBorder(errors.city)}
              />
              {errors.city && (
                <span className="text-xs text-red-600">{errors.city}</span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("checkout.zip")}
              <input
                maxLength={32}
                value={zip}
                onChange={(ev) => {
                  setZip(ev.target.value);
                  clearFieldError("zip");
                }}
                aria-invalid={errors.zip ? true : undefined}
                className={fieldBorder(errors.zip)}
              />
              {errors.zip && (
                <span className="text-xs text-red-600">{errors.zip}</span>
              )}
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            {t("checkout.country")}
            <input
              maxLength={64}
              value={country}
              onChange={(ev) => setCountry(ev.target.value)}
              className="rounded-md border border-black/[.12] bg-transparent px-3 py-2 outline-none focus:border-foreground dark:border-white/[.2]"
            />
          </label>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            {t("checkout.payment")}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHOD_KEYS.map((m) => (
              <label
                key={m}
                className={`cursor-pointer rounded-md border p-3 text-sm ${
                  paymentMethod === m
                    ? "border-foreground"
                    : "border-black/[.08] dark:border-white/[.145]"
                }`}
              >
                <input
                  type="radio"
                  name="payment_method"
                  value={m}
                  checked={paymentMethod === m}
                  onChange={() => setPaymentMethod(m)}
                  className="mr-2"
                />
                {t(`checkout.methods.${m}`)}
              </label>
            ))}
          </div>
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

        <button
          type="submit"
          disabled={disabled}
          className="self-start rounded-full bg-foreground px-6 py-2 text-background hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
        >
          {submitting ? t("checkout.placing") : t("checkout.placeOrder")}
        </button>
      </form>

      <aside className="flex h-fit flex-col gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {t("checkout.summary")}
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {cart!.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span className="line-clamp-1 text-zinc-600 dark:text-zinc-300">
                Post #{item.post_id} × {item.qty}
              </span>
              <span>€{item.line_total}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-black/[.08] pt-3 dark:border-white/[.145]">
          <span className="text-sm text-zinc-500">{t("cart.total")}</span>
          <span className="text-xl font-semibold">€{cart!.total}</span>
        </div>
        <Link
          href={href("/cart")}
          className="text-center text-xs text-zinc-500 underline"
        >
          {t("checkout.backToCart")}
        </Link>
      </aside>

      {pendingOrderId !== null && (
        <OrderWaitPopup
          orderId={pendingOrderId}
          onConfirmed={handleConfirmed}
          onCancel={handleCancelWait}
        />
      )}
    </main>
  );
}
