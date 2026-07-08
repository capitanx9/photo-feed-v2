import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone copies only the runtime files Next actually needs into
  // .next/standalone/, so the production image is small enough to ship
  // through ECR without dragging the full node_modules tree along.
  output: "standalone",

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
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
