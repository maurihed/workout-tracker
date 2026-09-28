# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# `postinstall` runs `prisma generate`, but the Prisma schema is not copied into
# this stage, so scripts must be skipped here. The build stage generates the
# client explicitly once the source and schema are present.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm build

# Migration image for Coolify's pre-deploy/release command. Derived from the
# build stage so the Prisma CLI (a devDependency), `prisma7.config.ts`, and the
# `prisma/` schema + migrations are all present. The `runner` stage does not
# ship the Prisma CLI, so `prisma migrate deploy` must run from this target.
FROM build AS migrate
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# One-off seed image: populates the exercise catalog + achievements, then exits.
# Derived from `build` so the Prisma CLI, tsx, prisma/seed, and src/ are present.
FROM build AS seed
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs
CMD ["./node_modules/.bin/tsx", "prisma/seed/index.ts"]

# Long-running pg-boss AI worker. Derived from `build` (which has tsx, scripts/,
# src/, and the generated Prisma client); it does not serve HTTP.
FROM build AS worker
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs
CMD ["./node_modules/.bin/tsx", "--tsconfig", "scripts/tsconfig.json", "scripts/worker-ai.ts"]

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
