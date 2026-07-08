// Locale routing proxy. If the incoming pathname doesn't start with a
// supported locale prefix, redirect to `/{preferredLocale}${pathname}`.
// Preference is read from the NEXT_LOCALE cookie (set by the client
// LocaleSwitcher) and falls back to the browser's Accept-Language
// header. If neither picks a supported locale, we default to English.
//
// Note: Next 16 renamed middleware to `proxy`. Same file conventions,
// same runtime — only the export name changed.

import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE } from "@/lib/i18n-config";

export const config = {
  // Skip Next internals, the /api proxy (which is nginx-served in prod
  // and doesn't need a locale), and static asset paths.
  matcher: ["/((?!api|_next|internal|favicon\\.ico|.*\\.[a-z0-9]+$).*)"],
};

function pickLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && (LOCALES as readonly string[]).includes(cookieLocale)) {
    return cookieLocale;
  }
  const accept = request.headers.get("accept-language") ?? "";
  for (const raw of accept.split(",")) {
    const tag = raw.split(";")[0].trim().toLowerCase();
    const base = tag.split("-")[0];
    if ((LOCALES as readonly string[]).includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (hasLocale) return;

  const locale = pickLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}
