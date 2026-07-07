// Small helpers for client-side form validation.
// Field-level errors are keyed by input name; empty string means "no error".
// Values are trimmed *before checking* but not on change — that would move
// the caret. Consumers are expected to trim again before sending to the API.

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

// RFC-5322-lite: something@something.something. Good enough for a client-side
// pre-check; the server does the real validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

// Accepts empty string OR a non-negative decimal with up to 2 fractional digits.
// Rejects things like "1.234", "-1", "abc", "1e3".
const PRICE_RE = /^\d+(\.\d{1,2})?$/;

export function isValidOptionalPrice(value: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  if (!PRICE_RE.test(v)) return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

export function hasErrors<K extends string>(errors: FieldErrors<K>): boolean {
  return Object.values(errors).some((v) => v !== undefined && v !== "");
}

// Field-border helper: appends a red border when the field has an error.
export function fieldBorder(err: string | undefined): string {
  const base =
    "rounded-md border bg-transparent px-3 py-2 outline-none focus:border-foreground";
  return err
    ? `${base} border-red-500 dark:border-red-500`
    : `${base} border-black/[.12] dark:border-white/[.2]`;
}
