"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiFetchError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await register(email, password);
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiFetchError) {
        const detail = (err.data.detail as string) ?? "";
        const fields = formatFieldErrors(err.data);
        setError(fields || detail || "Registration failed");
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">Create account</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="rounded-md border border-black/[.12] bg-transparent px-3 py-2 outline-none focus:border-foreground dark:border-white/[.2]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-black/[.12] bg-transparent px-3 py-2 outline-none focus:border-foreground dark:border-white/[.2]"
          />
        </label>
        {error && (
          <p aria-live="polite" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-foreground py-2 text-background hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
        >
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        Have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
