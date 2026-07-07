"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiFetchError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useHref, useT } from "@/lib/i18n";
import {
  fieldBorder,
  hasErrors,
  isEmail,
  type FieldErrors,
} from "@/lib/validation";

type RegisterField = "email" | "password";

function formatFieldErrors(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === "detail") continue;
    if (Array.isArray(value)) parts.push(`${key}: ${value.join(", ")}`);
    else if (typeof value === "string") parts.push(`${key}: ${value}`);
  }
  return parts.join(" · ");
}

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const t = useT();
  const href = useHref();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors<RegisterField>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): FieldErrors<RegisterField> {
    const e: FieldErrors<RegisterField> = {};
    const emailTrimmed = email.trim();
    if (!emailTrimmed) e.email = t("validation.emailRequired");
    else if (!isEmail(emailTrimmed)) e.email = t("validation.emailInvalid");
    if (!password) e.password = t("validation.passwordRequired");
    else if (password.length < 6) e.password = t("validation.passwordMin");
    return e;
  }

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setApiError(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;
    setPending(true);
    try {
      await register(email.trim(), password);
      router.push(href("/"));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiFetchError) {
        const detail = (err.data.detail as string) ?? "";
        const fields = formatFieldErrors(err.data);
        setApiError(fields || detail || t("auth.registerFailed"));
      } else {
        setApiError(t("auth.somethingWrong"));
      }
    } finally {
      setPending(false);
    }
  }

  const disabled = pending || hasErrors(errors);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">{t("auth.registerTitle")}</h1>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("auth.email")}
          <input
            type="email"
            name="email"
            value={email}
            onChange={(ev) => {
              setEmail(ev.target.value);
              if (errors.email)
                setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            className={fieldBorder(errors.email)}
          />
          {errors.email && (
            <span className="text-xs text-red-600">{errors.email}</span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("auth.password")}
          <input
            type="password"
            name="password"
            value={password}
            onChange={(ev) => {
              setPassword(ev.target.value);
              if (errors.password)
                setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            className={fieldBorder(errors.password)}
          />
          {errors.password && (
            <span className="text-xs text-red-600">{errors.password}</span>
          )}
        </label>
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
          className="rounded-full bg-foreground py-2 text-background hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
        >
          {pending ? t("auth.registerPending") : t("auth.registerSubmit")}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        {t("auth.haveAccount")}{" "}
        <Link href={href("/login")} className="underline">
          {t("nav.login")}
        </Link>
      </p>
    </main>
  );
}
