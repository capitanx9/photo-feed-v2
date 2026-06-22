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
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
