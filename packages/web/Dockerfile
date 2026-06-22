# syntax=docker/dockerfile:1.7

# packages/web — Next.js standalone image.
#
# Built from the REPO ROOT so that workspace-level paths line up with
# whatever future tooling adds at the root. Build command:
#
#   docker build -f packages/web/Dockerfile -t photo-feed-web:<tag> .
#                                                                  ↑
#                                          context = repo root
#
# Multi-stage:
#   deps    — npm ci with full devDeps (needed for `next build`)
#   builder — runs `next build` with output=standalone
#   runner  — node:22-alpine with only the standalone artifacts copied in;
#             no source, no node_modules, no .next/cache

# ----------------------------------------------------------------------
# deps — install all packages from package-lock.json
# ----------------------------------------------------------------------

FROM node:22-alpine AS deps

WORKDIR /app/packages/web

# We invalidate this layer only when the lockfile changes — code edits
# don't trigger an `npm ci` rerun on rebuilds.
COPY packages/web/package.json packages/web/package-lock.json ./
RUN npm ci

# ----------------------------------------------------------------------
# builder — `next build` produces .next/standalone with its own node_modules
# ----------------------------------------------------------------------

FROM node:22-alpine AS builder

WORKDIR /app/packages/web

COPY --from=deps /app/packages/web/node_modules ./node_modules

# Copy everything Next needs to build: source, configs, tsconfig, etc.
COPY packages/web/ ./

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ----------------------------------------------------------------------
# runner — minimal runtime image
# ----------------------------------------------------------------------

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nextjs

# `output: "standalone"` produces a self-contained server with the bare
# minimum runtime — server.js + a trimmed node_modules + .next/server.
# We also need the `static` and `public` directories alongside.
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/public ./packages/web/public

USER nextjs

EXPOSE 3000

# server.js is the entrypoint Next generates for the standalone server.
# It honours HOSTNAME and PORT from env — that's why we pin both above
# (and reaffirm HOSTNAME in compose to override Docker's container-name
# default, which would otherwise prevent inbound traffic).
CMD ["node", "packages/web/server.js"]
