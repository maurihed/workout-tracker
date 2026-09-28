# Phase 5 — Launch Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployable pg-boss AI worker image and a one-off production seed path, so a first Coolify launch can run the app, migrations, the AI worker, and a reproducible catalog seed.

**Architecture:** Two new multi-stage `Dockerfile` targets (`worker`, `seed`) derived `FROM build`. `scripts/worker-ai.ts` gains guarded Sentry initialization and process-level error handlers. `docs/deploy.md` and `.env.example` document the go-live runbook; CI smoke-builds both new targets. No application/product behavior changes.

**Tech Stack:** Docker (multi-stage), Coolify, Node 22, pnpm, `@sentry/node`, Prisma 7, pg-boss.

**Spec:** `docs/superpowers/specs/2026-09-27-gym-tracker-phase5-launch-infrastructure-design.md`

## Global Constraints

- Do not change product behavior, the database schema, or the seed/worker runtime logic beyond adding target definitions and Sentry error reporting.
- New Docker targets derive `FROM build`; do not alter the existing `deps`, `build`, `migrate`, or `runner` stages except where this plan states.
- The worker must remain inert when `SENTRY_DSN` is unset (no Sentry init, no network).
- `.env` and secrets must never be baked into images (verify `.dockerignore`).
- `@sentry/node` must stay on the same major line as the existing `@sentry/nextjs` (`^10`).
- Docs and `.env.example` must reflect the new targets and the pinned dataset variable; no hardcoded secrets.
- Commands: `pnpm lint` · `typecheck` · `test` · `test:integration` · `build` · `e2e`; Docker via `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`.

## Review Focus

1. **Worker image actually runs** — `docker run` the `worker` target against a reachable DB: it must connect to pg-boss and log startup, not exit immediately on a missing module (`tsx`, Prisma client) or crash on `NODE_ENV=production`.
2. **Sentry is inert without a DSN** — with `SENTRY_DSN` unset the worker starts and makes no Sentry calls; with a DSN set it initializes without error.
3. **Seed is idempotent and reaches the DB** — the `seed` target populates catalog + achievements on an empty DB and a second run is a safe no-op/upsert.
4. **No secrets in images** — `.env` is excluded by `.dockerignore`.
5. **Existing targets/CI unaffected** — `runner` and `migrate` still build; the existing gates stay green.

---

### Task 1: `worker` and `seed` Docker targets

**Files:**
- Modify: `Dockerfile`

**Interfaces:**
- Produces: image targets `worker` (runs `pnpm worker:ai`) and `seed` (runs `pnpm db:seed`).

- [ ] **Step 1: Confirm `.dockerignore` excludes secrets**

Run: `cat .dockerignore`
Expected: contains `.env` / `.env*` (and `node_modules`, `.next`). If `.env` is not listed, add `.env*` to `.dockerignore` (this is a required fix, not optional).

- [ ] **Step 2: Add the two stages**

Append to `Dockerfile` after the `migrate` stage (before or after `runner`; keep `runner` last so an unqualified build still targets it only if a default is set — this Dockerfile has no default target, so ordering is not significant, but keep the file readable):

```dockerfile
# One-off seed image: populates the exercise catalog + achievements, then exits.
# Derived from `build` so the Prisma CLI, tsx, prisma/seed, and src/ are present.
FROM build AS seed
ENV NODE_ENV=production
CMD ["pnpm", "db:seed"]

# Long-running pg-boss AI worker. Derived from `build` (which has tsx, scripts/,
# src/, and the generated Prisma client); it does not serve HTTP.
FROM build AS worker
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs
CMD ["pnpm", "worker:ai"]
```

- [ ] **Step 3: Verify both targets build**

Run:
```sh
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker build --target seed -t gym-seed .
docker build --target worker -t gym-worker .
```
Expected: both succeed (the `build` stage runs `pnpm build`).

- [ ] **Step 4: Verify the existing targets still build**

Run: `docker build --target runner -t gym-runner . && docker build --target migrate -t gym-migrate .`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build: add worker and seed docker targets"
```

---

### Task 2: Worker Sentry error reporting

**Files:**
- Modify: `scripts/worker-ai.ts`
- Modify: `package.json` (add `@sentry/node`)
- Test: manual verification (no unit test framework targets the worker entrypoint)

**Interfaces:**
- Consumes: `SENTRY_DSN` env.
- Produces: worker that initializes Sentry only when `SENTRY_DSN` is set and reports `uncaughtException`/`unhandledRejection`.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add @sentry/node@^10`
Expected: `package.json` lists `@sentry/node` on the `^10` line matching `@sentry/nextjs`; lockfile updated.

- [ ] **Step 2: Update the worker entrypoint**

Replace `scripts/worker-ai.ts` with:

```ts
import "dotenv/config"
import * as Sentry from "@sentry/node"
import { getBoss, startAiWorker } from "../src/server/ai/queue"
import { runJob } from "../src/server/services/ai.service"

const dsn = process.env.SENTRY_DSN?.trim()
if (dsn) {
  Sentry.init({ dsn, environment: process.env.NODE_ENV })
}

function report(error: unknown) {
  console.error(error)
  if (dsn) Sentry.captureException(error)
}

process.on("uncaughtException", (error) => {
  report(error)
  process.exit(1)
})
process.on("unhandledRejection", (reason) => {
  report(reason)
})

await startAiWorker((jobId) => runJob(jobId))
console.log("ai worker started")

async function shutdown() {
  const boss = await getBoss()
  await boss.stop()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown())
process.on("SIGTERM", () => void shutdown())
```

- [ ] **Step 3: Verify typecheck/lint and the no-DSN inert path**

Run: `pnpm typecheck && pnpm lint`
Expected: pass.

Then run the worker locally against the dev DB with no DSN and confirm it starts and stops:
```sh
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; docker compose up -d db
SENTRY_DSN= timeout 8 pnpm worker:ai; echo "exit=$?"
```
Expected: logs `ai worker started`, then exits 124 (killed by `timeout`) — i.e. it stayed running rather than crashing.

- [ ] **Step 4: Verify the worker image with and without a DSN**

Run:
```sh
docker build --target worker -t gym-worker .
docker run --rm -e DATABASE_URL="postgresql://gym:gym@host.docker.internal:5432/gym?schema=public" --add-host host.docker.internal:host-gateway gym-worker &
sleep 6 && docker stop $(docker ps -q --filter ancestor=gym-worker) || true
```
Expected: the container logs `ai worker started` (no Sentry init, no crash). Then repeat with `-e SENTRY_DSN=""` to confirm an empty DSN is also inert, and optionally with a real-looking DSN to confirm init does not throw.
Note: `host.docker.internal` reaches the host's Postgres on Docker Desktop; if the platform differs, use a networked DB.

- [ ] **Step 5: Commit**

```bash
git add scripts/worker-ai.ts package.json pnpm-lock.yaml
git commit -m "feat(worker): report unhandled errors to sentry"
```

---

### Task 3: `.env.example` + deploy runbook

**Files:**
- Modify: `.env.example` (document `FREE_EXERCISE_DB_URL`)
- Modify: `docs/deploy.md` (add `worker` + `seed` targets and the go-live runbook)

- [ ] **Step 1: Pin the dataset commit**

Resolve the current `free-exercise-db` default-branch commit:
```sh
git ls-remote https://github.com/yuhonas/free-exercise-db HEAD
```
Record the SHA (e.g. `abc123…`). If the network is unavailable, use the upstream `main` URL and note in `docs/deploy.md` that the SHA must be pinned before launch. Construct:
`https://raw.githubusercontent.com/yuhonas/free-exercise-db/<SHA>/dist/exercises.json`

- [ ] **Step 2: Document the dataset variable**

Add to `.env.example` after the AI block:

```
# Optional: override the exercise dataset used by `pnpm db:seed`.
# Pin to a commit for reproducible production seeding (see docs/deploy.md).
FREE_EXERCISE_DB_URL=""
```

- [ ] **Step 3: Update the deploy doc**

In `docs/deploy.md`, extend the targets table with `worker` and `seed`, and add a "Go-live runbook" section covering:
1. Build/run `migrate` (release step) against production.
2. Run the `seed` target once as a one-off Coolify task with the production `DATABASE_URL` and `FREE_EXERCISE_DB_URL` pinned to the recorded commit; note the seed is idempotent and re-runnable to refresh the catalog.
3. Deploy `runner` (app) and `worker` (second application, `worker` target, restart-on-failure, same env; no port/healthcheck).
4. Note `@sentry/node` reporting in the worker and that it is inert without `SENTRY_DSN`.
Include the exact `docker build --target …` / `docker run` commands used to verify locally.

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/deploy.md
git commit -m "docs: worker and seed deploy runbook"
```

---

### Task 4: CI smoke-build for the new targets

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the `worker` and `seed` Docker targets.

- [ ] **Step 1: Add a build step**

Add to the `verify` job after `pnpm build` (GitHub-hosted runners have Docker; the build stage needs no secrets/network beyond the lockfile, which is already present):

```yaml
      - name: Build worker and seed images
        run: |
          docker build --target worker -t gym-worker .
          docker build --target seed -t gym-seed .
```

- [ ] **Step 2: Verify the workflow is valid YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: smoke-build worker and seed images"
```

---

### Task 5: End-to-end verification, gates, roadmap

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Verify the seed end-to-end against a scratch database**

Run (using a scratch DB so the dev data is untouched):
```sh
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d db
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker exec gym-db-1 psql -U gym -d postgres -c 'DROP DATABASE IF EXISTS gym_seedcheck; CREATE DATABASE gym_seedcheck;' || true
docker build --target migrate -t gym-migrate .
docker run --rm -e DATABASE_URL="postgresql://gym:gym@host.docker.internal:5432/gym_seedcheck?schema=public" --add-host host.docker.internal:host-gateway gym-migrate
docker build --target seed -t gym-seed .
docker run --rm -e DATABASE_URL="postgresql://gym:gym@host.docker.internal:5432/gym_seedcheck?schema=public" -e FREE_EXERCISE_DB_URL="<pinned-url>" --add-host host.docker.internal:host-gateway gym-seed
docker run --rm -e DATABASE_URL="postgresql://gym:gym@host.docker.internal:5432/gym_seedcheck?schema=public" -e FREE_EXERCISE_DB_URL="<pinned-url>" --add-host host.docker.internal:host-gateway gym-seed
```
Expected: first seed run prints created counts; second run prints `updated`/zero-created and exits 0 (idempotent). Spot-check with `docker exec gym-db-1 psql -U gym -d gym_seedcheck -c 'select count(*) from "Exercise";'` (non-zero).
If a scratch DB is impractical in this environment, run the seed against the dev DB once and document it; do not skip verification silently.

- [ ] **Step 2: Verify all Docker targets build**

Run: `for t in deps build migrate runner worker seed; do docker build --target "$t" -t "gym-$t" . || exit 1; done; echo ALL_TARGETS_OK`
Expected: `ALL_TARGETS_OK`.

- [ ] **Step 3: Run the gates**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build`
Expected: all green. (No application behavior changed; `pnpm e2e` optional here since no UI/API change.)
Docker env for integration: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; docker compose up -d db; pnpm db:seed`.

- [ ] **Step 4: Update the roadmap**

In `docs/ROADMAP.md`, set the current-branch line to `phase5-launch-infrastructure`, add a `5 | Launch Infrastructure | Done (pending merge)` row with the spec/plan/SDD paths, and note 5A (AI worker deployment) + 5B (first-deploy seed) as covered by this phase. Keep the "no further phases planned" note.

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark phase 5 launch infrastructure complete"
```

---

## Self-Review

- **Spec coverage:** §3.1 worker target → T1; §3.2 Sentry → T2; §3.3 Coolify process → T3; §4.1 seed target → T1; §4.2 pinned dataset → T3; §4.3 runbook → T3; §5 verification + CI → T4/T5; §6 risks → Review Focus; §7 acceptance → T5.
- **Placeholders:** the only placeholder is `<pinned-url>`/`<SHA>`, resolved in T3 Step 1 by `git ls-remote` (an action, not an unanswered design question).
- **Type consistency:** targets named `worker`/`seed` consistently across Dockerfile, docs, CI, and the roadmap.
- **Review Focus:** #1/#2 → T2 Step 4; #3 → T5 Step 1; #4 → T1 Step 1; #5 → T1 Step 4 + T5 Step 3.
