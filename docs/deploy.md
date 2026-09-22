# Deploying Gym Tracker (Coolify)

The app ships as a multi-stage `Dockerfile` with three relevant targets:

| Target   | Purpose                                                        |
| -------- | -------------------------------------------------------------- |
| `runner` | The Next.js standalone server. This is the deployed app image. |
| `migrate`| One-shot `prisma migrate deploy` image used as the pre-deploy / release step. |
| `build`  | Intermediate build stage (not deployed directly).              |

## Coolify setup

1. **Application**
   - Build target: `runner`.
   - Expose port `3000`. The image runs as the non-root `nextjs` user and
     ships a `HEALTHCHECK` against `/api/health`.

2. **Pre-deploy / release command**
   - Build target: `migrate`.
   - Command: the image's default `CMD` (`pnpm exec prisma migrate deploy`).
   - This stage is built `FROM build`, so it contains the Prisma CLI
     (a devDependency), `prisma7.config.ts`, and `prisma/schema.prisma` +
     `prisma/migrations/`. The `runner` image intentionally does **not** ship
     the Prisma CLI or the config, so migrations must not be invoked there.
   - Coolify injects the same environment (notably `DATABASE_URL`) into the
     release step as into the app.

3. **Environment**
   - Copy every variable from `.env.example` into Coolify's environment. In
     particular `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, the Google/Facebook
     OAuth pairs, and `SENTRY_DSN`.
   - `SENTRY_DSN` is server-side only. Client-side error tracking additionally
     requires `NEXT_PUBLIC_SENTRY_DSN`; without it client instrumentation is a
     no-op (see `instrumentation-client.ts`).

4. **Deploy flow**
   - Push to `main` → Coolify builds `runner` → runs the `migrate` release
     command → starts the `runner` container.

## Building locally

```sh
# App image
docker build --target runner -t gym-tracker .

# Migration image (used by the release step)
docker build --target migrate -t gym-tracker-migrate .
docker run --rm -e DATABASE_URL="postgresql://..." gym-tracker-migrate
```

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
