# NewsPoint public site (@newspoint/web) for temporary GCP Cloud Run demo.
# Build: docker build -f deploy/gcp-demo/docker/web.Dockerfile .
# See docs/gcp-demo/README.md

FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm" \
  PATH="/pnpm:$PATH" \
  NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/studio/package.json apps/studio/
COPY packages/content/package.json packages/content/
COPY packages/db/package.json packages/db/
RUN pnpm fetch
COPY . .
RUN pnpm install -r --offline --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app .
ARG DATABASE_URL
ARG DATABASE_URL_SESSION
ENV NP_DOCKER_BUILD=1 \
  DATABASE_URL=${DATABASE_URL} \
  DATABASE_URL_SESSION=${DATABASE_URL_SESSION}
RUN pnpm --filter @newspoint/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
  PORT=8080 \
  HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
