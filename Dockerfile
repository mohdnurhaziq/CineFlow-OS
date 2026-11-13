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

# On start: sync the schema into the SQLite file on the data volume,
# seed demo data the very first time (empty database), then launch Next.js.
CMD ["sh", "-c", "FIRST_RUN=0; [ -f /app/data/dev.db ] || FIRST_RUN=1; pnpm prisma db push --skip-generate && if [ \"$FIRST_RUN\" = 1 ] && [ \"${SEED_ON_FIRST_RUN:-true}\" = true ]; then pnpm db:seed; fi; exec pnpm start"]
