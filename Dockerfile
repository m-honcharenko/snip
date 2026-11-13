# syntax=docker/dockerfile:1

ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-slim AS base
# Keep in sync with "packageManager" in package.json
ARG PNPM_VERSION=12.14.0
# openssl: Prisma's schema engine needs it to run migrations
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# All dependencies, cached until the lockfile changes
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Generate the Prisma client and compile
FROM deps AS build
COPY prisma ./prisma
COPY prisma.config.ts nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
# prisma.config.ts reads DATABASE_URL, but generating the client never connects
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm prisma generate \
  && pnpm build

# One-shot job: applies pending migrations and exits
FROM deps AS migrate
COPY prisma ./prisma
COPY prisma.config.ts ./
CMD ["pnpm", "prisma", "migrate", "deploy"]

# Production dependencies only
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/main"]
