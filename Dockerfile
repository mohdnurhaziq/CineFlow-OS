# ─── CineFlow OS — production image ───────────────────────────────────────────
# Build:  docker compose build
# Run:    docker compose up -d   →  http://localhost:3000

FROM node:22-bookworm-slim AS base
# openssl is required by the Prisma query engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ─── Build ────────────────────────────────────────────────────────────────────
FROM base AS build
# NEXT_PUBLIC_* values are baked into the client bundle at build time.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_DOMAIN=localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_DOMAIN=$NEXT_PUBLIC_APP_DOMAIN \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/tmp/build.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate && pnpm build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app ./
RUN mkdir -p /app/data /app/storage /app/public/uploads

EXPOSE 3000

# On start: check settings, apply the recorded database changes (prisma/migrations), fill a
# brand-new non-production database with demo data, then start Next.js. See scripts/start.ts.
CMD ["sh", "-c", "pnpm tsx scripts/start.ts && exec pnpm start"]
