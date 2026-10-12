# Deploying Gym Tracker (Coolify)

The app ships as a multi-stage `Dockerfile` with five relevant targets:

| Target   | Purpose                                                        |
| -------- | -------------------------------------------------------------- |
| `runner` | The Next.js standalone server. Applies pending migrations at start-up, then serves HTTP. |
| `migrate`| One-shot `prisma migrate deploy` image, kept for manual/CI use. |
| `worker` | Long-running pg-boss AI worker. Deployed as a second application; serves no HTTP. |
| `seed`   | One-shot exercise/achievement seeder. Run as a one-off task.   |
| `build`  | Intermediate build stage (not deployed directly).              |

The `runner` image starts through `docker/entrypoint.sh`, which runs
`prisma migrate deploy` against `DATABASE_URL` and then `exec`s the server, so
pending migrations are applied on every container start. The `worker` image's
`CMD` invokes tsx directly —
`./node_modules/.bin/tsx --tsconfig scripts/tsconfig.json scripts/worker-ai.ts`
— and the `seed` image's `CMD` invokes
`./node_modules/.bin/tsx prisma/seed/index.ts`, so neither downloads pnpm
(or anything else) at container start. `pnpm worker:ai` and `pnpm db:seed` are
the equivalent source-level scripts for local development.

## Coolify setup

1. **Application**
   - Build target: `runner`.
   - Expose port `3000`. The image runs as the non-root `nextjs` user and
     ships a `HEALTHCHECK` against `/api/health`.

2. **Migrations**
   - Applied automatically: the `runner` image runs `prisma migrate deploy` at
     start-up (`docker/entrypoint.sh`) before serving, so a normal deploy
     migrates the database with no extra step. Migrations are additive and safe
     to re-run; Prisma records them in `_prisma_migrations`.
   - Coolify's *Pre-deployment command* is still not used for this: it runs
     inside the current application container and is skipped on the first
     deployment.
   - The `migrate` target remains for manual use and CI. It is built `FROM build`
     and contains the Prisma CLI (a devDependency), `prisma7.config.ts`, and
     `prisma/schema.prisma` + `prisma/migrations/`; run it as a one-off against
     a `DATABASE_URL` (see "Building locally").
   - The `migrator` stage installs an isolated Prisma CLI into `/migrate` for the
     runner. It does not copy pnpm's full `node_modules` (which is ~1.2 GB);
     the isolated install is ~55 MB.

3. **Environment**
   - Copy every variable from `.env.example` into Coolify's environment. In
     particular `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, the Google/Facebook
     OAuth pairs, and `SENTRY_DSN`.
   - `SENTRY_DSN` is server-side only. Client-side error tracking additionally
     requires `NEXT_PUBLIC_SENTRY_DSN`; without it client instrumentation is a
     no-op (see `instrumentation-client.ts`).

4. **Deploy flow**
   - Push to `main` → Coolify builds `runner` → starts the `runner` container,
     which applies pending migrations before serving.

5. **Worker (second application)**
   - Create a second Coolify application pointing at the same repository.
     Set **Dockerfile Location** to `/Dockerfile.worker` and **Docker Build
     Stage Target** to `worker`. Do not add a domain and disable the
     healthcheck (the worker does not serve HTTP).
   - Use `Dockerfile.worker` (not `Dockerfile`) on purpose: Coolify's
     HEALTHCHECK detection parses the whole Dockerfile text and ignores
     `dockerfile_target_build` (coollabsio/coolify#9475), so the `runner`
     stage's HEALTHCHECK leaks into the worker application and cannot be
     disabled from the UI. `Dockerfile.worker` contains no HEALTHCHECK, so the
     bug cannot trigger.
   - Coolify still requires a value in **Ports Exposes**; `3000` is a harmless
     placeholder since no domain is attached. Remove any port mapping.
   - Set the restart policy to restart-on-failure (`unless-stopped` /
     `restart: on-failure`) so the long-running pg-boss process is revived if it
     crashes.
   - Give it the same environment as the app (`DATABASE_URL`, `AI_*`, and
     `SENTRY_DSN`), since it connects to the same database and queue.
   - The worker reports errors to Sentry via `@sentry/node`. Reporting is inert
     unless `SENTRY_DSN` is set; `uncaughtException` is flushed to Sentry before
     the process exits.

## Go-live runbook

Run these steps in order on first deploy (and after schema/seeding changes):

1. **Migrate.** Automatic — the `runner` container applies pending migrations
   on start. To apply them without deploying the app, build the `migrate` image
   and run it against the production `DATABASE_URL` (below). Migrations are
   additive and safe to re-run.

2. **Seed once.** Run the `seed` target as a one-off Coolify task with the
   production `DATABASE_URL` and `FREE_EXERCISE_DB_URL` pinned to a
   `free-exercise-db` commit:
   `https://raw.githubusercontent.com/yuhonas/free-exercise-db/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/dist/exercises.json`
   The seed is idempotent: exercises and achievements are upserted, so it can
   be re-run at any time to refresh the catalog from a new pinned commit. The
   seed fetches the dataset over the network at run time, so this task must run
   on a network with outbound egress. The `seed` image runs as the non-root
   `nextjs` user and does not need a shadow DB. Leaving `FREE_EXERCISE_DB_URL`
   empty falls back to the upstream `main` dataset URL.

3. **Deploy the app and worker.** Deploy `runner` (with the `migrate` release
   step) and then the `worker` application (see Coolify setup). `@sentry/node`
   in the worker is inert until `SENTRY_DSN` is configured.

## Building locally

```sh
# App image
docker build --target runner -t gym-tracker .

# Migration image (run as a one-off application to apply migrations)
docker build --target migrate -t gym-tracker-migrate .
docker run --rm -e DATABASE_URL="postgresql://..." gym-tracker-migrate

# Worker image (long-running, no port)
docker build -f Dockerfile.worker --target worker -t gym-worker .

# Seed image (one-off). On macOS the host DB is reached via
# host.docker.internal, which requires --add-host host.docker.internal:host-gateway.
docker build --target seed -t gym-seed .
docker run --rm \
  -e DATABASE_URL="postgresql://gym:gym@host.docker.internal:5432/gym_seedcheck?schema=public" \
  -e FREE_EXERCISE_DB_URL="https://raw.githubusercontent.com/yuhonas/free-exercise-db/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/dist/exercises.json" \
  --add-host host.docker.internal:host-gateway \
  gym-seed
```

The `worker` image is verified the same way (`docker run --rm -e DATABASE_URL=... --add-host host.docker.internal:host-gateway gym-worker`) once a database is reachable; it blocks on the pg-boss queue rather than exiting.

## CI drift check

CI compares the migrations directory against the schema datamodel so a schema
edit that is not captured by a migration fails the build:

```sh
pnpm exec prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema prisma/schema.prisma \
  --exit-code
```

`migrate diff --from-migrations` needs a disposable shadow database. Set
`SHADOW_DATABASE_URL` (see `prisma7.config.ts`) to a database the CI user may
recreate; CI creates `gym_shadow` for this purpose. The command exits `2` when
differences are found and `0` when migrations and schema agree.

## Release notes

The `runner` container applies any pending migration in `prisma/migrations/` at
start-up, before serving traffic. Migrations are additive and safe to re-run
(Prisma records applied migrations in `_prisma_migrations`).

- **Phase 1.5 — `20260922210226_add_routine`:** adds the routine models
  (`Routine`, `RoutineDay`, `RoutineExercise`) with their indexes and cascading
  foreign keys, the `RoutineSource`, `TimerType`, and `Location` enums, and the
  `Profile.equipment`, `Profile.location`, and `Profile.onboardingSkippedAt`
  onboarding columns. Existing rows are unaffected: the new columns are
  nullable or defaulted (`equipment` defaults to `'{}'`).
- **Phase 2A — `20260923000922_add_routine_day_unique_weekday`:** adds the
  `RoutineDay_routineId_weekday_key` unique index on `RoutineDay(routineId,
  weekday)`, enforcing one day per weekday within a routine. Every existing
  routine was created from an onboarding template, and templates assign each
  day a distinct weekday, so the index applies cleanly; no rows are modified.
- **Phase 2A — `20260923021106_drop_redundant_routine_day_index`:** drops the
  `RoutineDay_routineId_idx` index, which the unique
  `RoutineDay_routineId_weekday_key` index above made redundant (its leading
  `routineId` column already serves routine-scoped lookups). This removes an
  index only; no columns, constraints, or rows change.
- **Phase 2B — `20260923030740_add_session`:** adds the workout session models
  (`WorkoutSession`, `SessionExercise`, `SetLog`) with their indexes and the
  `SessionStatus` and `SetType` enums, plus the `WorkoutSession.snapshot` JSONB
  column that captures the routine prescription at start time. All three models
  are new tables, so existing rows are unaffected. `WorkoutSession.userId` and
  the two child→parent foreign keys cascade on delete, while
  `SessionExercise.exerciseId` is `ON DELETE SET NULL`, matching the
  routine-exercise rule below.
- **Foreign-key delete behavior:** every routine foreign key cascades on delete
  except `RoutineExercise.exerciseId`, which is `ON DELETE SET NULL` so deleting
  a catalog exercise leaves the routine's prescription intact.
