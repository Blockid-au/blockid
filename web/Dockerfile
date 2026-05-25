# syntax=docker/dockerfile:1.7

# ---------- 1. deps stage ----------
# Install only production-ready dependencies needed for build.
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy lockfiles first to maximize layer caching.
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable && pnpm install --frozen-lockfile; \
  elif [ -f yarn.lock ]; then \
    corepack enable && yarn install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then \
    npm ci; \
  else \
    npm install; \
  fi

# ---------- 2. build stage ----------
FROM node:22-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# NEXT_PUBLIC_* vars are read from .env at build time by Next.js.
# The .env file is included in the Docker build context (not in .dockerignore).
# No ARG/ENV needed — Next.js reads .env directly during `next build`.

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# .env (if present) is NOT copied to the final runtime image (multi-stage build).
# Runtime secrets are injected via --env-file at docker run.
RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable && pnpm run build; \
  elif [ -f yarn.lock ]; then \
    corepack enable && yarn build; \
  else \
    npm run build; \
  fi

# ---------- 3. runtime stage ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# wget is used by the HEALTHCHECK below.
RUN apk add --no-cache wget

# The "node" user already exists in the official node:alpine images
# (uid/gid 1000) — reuse it instead of creating a custom one.
RUN mkdir -p /app/.next && chown -R node:node /app

# Next.js standalone output: copy the minimal server, static assets, and public/.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/ai-worker.mjs ./ai-worker.mjs
# serverExternalPackages are NOT traced by standalone — copy full node_modules
# for packages like bcryptjs, google-auth-library, @anthropic-ai/sdk, pptxgenjs.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
