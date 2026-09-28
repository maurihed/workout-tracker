# Gym Tracker — Phase 5 Launch Infrastructure — Design Spec

- **Date:** 2026-09-27
- **Status:** Proposed
- **Author:** Mauricio Hernandez (with opencode)
- **Parent spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md` (binding, §17)
- **Depends on:** Phases 1–4B (merged). 4A introduced the pg-boss AI worker (`pnpm worker:ai`) and its deploy note.
- **Type:** Operational readiness (no product behavior change)

## 1. Objective

Close the two gaps that block a first production launch on Coolify:

1. **The AI worker has no deployable image.** The `runner` image is standalone-only (`.next/standalone`) and ships neither `src/`, `scripts/`, nor `tsx`, so `pnpm worker:ai` cannot run from it. 4A's deploy note assumes a separate Coolify process, but no image target or documentation exists.
2. **A fresh production database cannot be populated.** The exercise catalog and achievements come from `pnpm db:seed` (which fetches a remote dataset), but the release flow only runs `prisma migrate deploy`, so a new prod DB would have an empty catalog and no achievements.

### Success criteria

- A `worker` Docker target exists and runs `pnpm worker:ai` successfully against a production `DATABASE_URL`; it is deployable as a second Coolify process and restarts on failure.
- Worker errors surface in Sentry when `SENTRY_DSN` is set, and the worker still logs to stdout.
- A `seed` Docker target exists; running it once against a fresh database populates the exercise catalog and achievements, and re-running it is safe (idempotent upserts).
- The dataset source is pinned to a fixed `free-exercise-db` commit, so seeding is reproducible.
- `docs/deploy.md` documents the go-live runbook: app, migrate, worker, and the one-off seed task with the pinned dataset URL.
- CI stays green; the new images build.

### Non-goals (out of scope for Phase 5)

- Bundling/minifying the worker (accept a larger image derived from `build`).
- Worker autoscaling, multiple replicas, or a liveness/health endpoint (chosen: Sentry + logs only).
- Log shipping beyond stdout, alerting rules, backup scheduling, or a restore runbook.
- Production auth/OAuth/env go-live checklist and post-deploy smoke tests.
- SQL data migrations for the catalog (seeds stay in the TypeScript seed script).
- Changing the seed's data shape or the worker's runtime behavior.

## 2. Deployment topology

The multi-stage `Dockerfile` gains two targets; Coolify runs four things against one Postgres:

| Target | Purpose | Coolify use |
|---|---|---|
| `runner` (existing) | Next.js standalone server | Application |
| `migrate` (existing) | `prisma migrate deploy` | Pre-deploy / release command |
| **`worker`** (new) | pg-boss AI job worker | Second application/process, restart on failure |
| **`seed`** (new) | One-off catalog + achievements seed | Manual one-off task (first deploy / catalog refresh) |

Both new targets derive `FROM build`, which already contains `node_modules` (incl. `tsx`), `src/`, `scripts/`, and the generated Prisma client. This avoids bundling at the cost of a larger image; acceptable for internal processes.

## 3. Worker target

### 3.1 Dockerfile

```dockerfile
FROM build AS worker
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs
CMD ["pnpm", "worker:ai"]
```

The `worker:ai` script already exists (`tsx --tsconfig scripts/tsconfig.json scripts/worker-ai.ts`), and `scripts/worker-ai.ts` already starts `startAiWorker(runJob)` and stops pg-boss on SIGINT/SIGTERM. `NODE_ENV=production` keeps the worker's dependencies in production mode at runtime; `build` stage's devDependencies remain installed (required for `tsx`).

### 3.2 Worker error reporting

`scripts/worker-ai.ts` initializes Sentry when `SENTRY_DSN` is set, before starting the worker, and reports unhandled failures:

- Add `@sentry/node` as a dependency (version aligned with `@sentry/nextjs`, currently `^10`). `@sentry/nextjs` is Next-runtime-oriented; the standalone worker uses `@sentry/node` directly.
- On startup: if `SENTRY_DSN` is set (non-empty), `Sentry.init({ dsn, environment: process.env.NODE_ENV })`.
- Register `process.on("uncaughtException", …)` and `process.on("unhandledRejection", …)` handlers that log via the existing `logger` and, when initialized, `Sentry.captureException(error)` before exiting non-zero on `uncaughtException`.
- No DSN ⇒ no `Sentry.init` and no capture (fully inert), preserving today's behavior.

The existing `runJob` already catches and logs job-level failures (and marks jobs failed); no per-job Sentry call is required. Only process-level failures are newly reported.

### 3.3 Coolify process

- New application using the `worker` image target, with the same environment as the app (notably `DATABASE_URL`, `AI_*`, and `SENTRY_DSN`).
- Restart policy: always / on failure. `SIGTERM` during redeploy triggers the worker's graceful pg-boss stop.
- Documented that the worker does not serve HTTP and needs no port or healthcheck.

## 4. Seed target

### 4.1 Dockerfile

```dockerfile
FROM build AS seed
ENV NODE_ENV=production
CMD ["pnpm", "db:seed"]
```

The seed script (`prisma/seed/index.ts`) upserts exercises and achievements, so it is safe to run repeatedly. It requires network access at run time to fetch the dataset.

### 4.2 Pinned dataset

- Pin `FREE_EXERCISE_DB_URL` to a specific `free-exercise-db` commit, e.g. `https://raw.githubusercontent.com/yuhonas/free-exercise-db/<commit-sha>/dist/exercises.json`. The exact commit is resolved at implementation time and recorded in the deploy doc.
- Document `FREE_EXERCISE_DB_URL` in `.env.example` (optional; defaults to the upstream `main` URL for local dev).
- The seed task in Coolify sets `FREE_EXERCISE_DB_URL` explicitly so production seeding is reproducible and does not depend on upstream `main` moving.

### 4.3 Go-live procedure

Documented in `docs/deploy.md`:

1. Build/run `migrate` (release step) against the production database.
2. Run the `seed` target once as a one-off Coolify task with the production `DATABASE_URL` and pinned `FREE_EXERCISE_DB_URL`.
3. Deploy `runner` and `worker`.
4. To refresh the catalog later, re-run the one-off `seed` task (idempotent).

## 5. Verification

- `docker build --target worker -t gym-worker .` and `docker build --target seed -t gym-seed .` succeed locally.
- Running `gym-seed` against a scratch/empty Postgres populates exercises + achievements; a second run creates/updates nothing new (idempotent) and exits 0.
- Running `gym-worker` against the dev database connects to pg-boss and logs startup; with no `SENTRY_DSN` it starts without Sentry; with a DSN it initializes without error.
- The `runner` and `migrate` targets continue to build unchanged.
- CI: add a step that builds the `worker` and `seed` targets so a broken target fails PRs (Docker is available on GitHub-hosted runners). If a network-restricted CI makes image builds impractical, document instead.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`, `pnpm e2e` remain green (no application code changes beyond the worker script).

## 6. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Worker image is large (derived from `build`) | Accepted; internal process. A slimmer runtime is a later optimization. |
| 2 | `@sentry/node` version drift from `@sentry/nextjs` | Pin to the same major/minor line; both are already in the Sentry v10 family. |
| 3 | Upstream dataset drifts or is unavailable | Pin the raw URL to a commit; seeding is a manual, retryable one-off. |
| 4 | Accidental re-seed overwrites curated catalog data | Seed upserts by source id and never deletes; document that it is additive/idempotent. |
| 5 | Two processes double-processing jobs | pg-boss is safe for concurrent workers; the worker is single-replica at launch and can be scaled later. |
| 6 | Missing env in the worker process (e.g. `AI_*`) | Same env set as the app; with `AI_*` unset the worker still runs and the template fallback is used. |

## 7. Acceptance criteria

- `worker` and `seed` Docker targets build in CI and locally.
- The worker image starts, connects to Postgres/pg-boss, processes jobs, and reports unhandled errors to Sentry when configured, with stdout logs otherwise.
- A fresh production database can be populated via the one-off `seed` task from the pinned dataset, idempotently.
- `docs/deploy.md` and `.env.example` document the new targets, the worker process, and the seed runbook.
- No product behavior changes; all gates remain green.

## 8. Traceability to parent spec

| Parent spec item | Covered by |
|---|---|
| §17.3 Build & deploy (multi-stage Docker, Coolify) | §2, §3.1, §4.1 |
| §17.2 Environments & configuration | §3.3, §4.2 (env for worker/seed; `FREE_EXERCISE_DB_URL`) |
| §16 AI subsystem job lifecycle (worker on Coolify) | §3 (deployable worker + error reporting) |
| §8 Data model / seeded reference data (exercises, achievements) | §4 (first-deploy seed) |
| §19 Testing / gates | §5 |
