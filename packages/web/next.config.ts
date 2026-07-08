import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone copies only the runtime files Next actually needs into
  // .next/standalone/, so the production image is small enough to ship
  // through ECR without dragging the full node_modules tree along.
  output: "standalone",

  // Django uses APPEND_SLASH; every /api/*/ request the frontend sends
  // must be forwarded as-is, not 308'd to the slashless form (which
  // Django would then 301 straight back — endless redirect that lands
  // in the browser as "Failed to fetch"). Only affects our own routing;
  // Next still normalises app-router paths as usual.
  skipTrailingSlashRedirect: true,

  // Dev-only proxy so the frontend can keep talking to /api/* as if it
  // were same-origin in dev too. In prod, nginx does this routing; here,
  // Next forwards /api/ requests to the Django runserver. Skipped in
  // production (NODE_ENV=production) so nginx stays in charge.
  //
  // API_ORIGIN lets docker-compose.dev.yml point at the api container
  // (http://api:8000) instead of the default host-based localhost.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    const apiOrigin = process.env.API_ORIGIN || "http://localhost:8000";
    // Two rules: one for /api/foo/ (Django APPEND_SLASH shape, the one
    // the frontend actually sends) and one for /api/foo (would otherwise
    // trigger Django's 301). Keeping both forms explicit avoids the
    // trailing-slash redirect loop that broke dev on Next 16.
    return [
      {
        source: "/api/:path*/",
        destination: `${apiOrigin}/api/:path*/`,
      },
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
