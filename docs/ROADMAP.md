# Gym Tracker — Roadmap & Status

Single entry point for picking up work in a fresh session.

- **Product spec (binding authority):** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md`
- **Current branch:** `phase5-launch-infrastructure` — Phase 5 (launch infrastructure) done, pending merge; next is release hardening.
- **Delivery process:** per-phase → brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → subagent-driven TDD execution, with an audit trail in `.superpowers/sdd/<plan-slug>/`.

## Phase status

| Phase | Name | Status | Spec | Plan | SDD workspace |
|---|---|---|---|---|---|
| 1 | Foundation | Done (merged) | `.../specs/2026-09-22-gym-tracker-design.md` §4.2 | `.../plans/2026-09-22-gym-tracker-phase1-foundation.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase1-foundation/` |
| 1.5 | Onboarding | Done (merged) | `.../specs/2026-09-22-gym-tracker-phase1.5-onboarding-design.md` | `.../plans/2026-09-22-gym-tracker-phase1.5-onboarding.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase1.5-onboarding/` |
| 2A | Routine Builder | Done (merged) | `.../specs/2026-09-22-gym-tracker-phase2a-routine-builder-design.md` | `.../plans/2026-09-22-gym-tracker-phase2a-routine-builder.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase2a-routine-builder/` |
| 2B | Workout Runner & Timers | Done (merged) | `.../specs/2026-09-22-gym-tracker-phase2b-workout-runner-design.md` | `.../plans/2026-09-22-gym-tracker-phase2b-workout-runner.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase2b-workout-runner/` |
| 2C | PWA / Offline | Done (merged) | `.../specs/2026-09-22-gym-tracker-phase2c-pwa-offline-design.md` | `.../plans/2026-09-22-gym-tracker-phase2c-pwa-offline.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase2c-pwa-offline/` |
| 3A | Tracking + Gamification (streaks, XP, badges, history) | Done | `.../specs/2026-09-22-gym-tracker-phase3a-tracking-stats-design.md` | `.../plans/2026-09-22-gym-tracker-phase3a-tracking-stats.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase3a-tracking-stats/` |
| 3B | Progress Dashboard (charts, heatmap, PR views, body-metric log) | Done | `.../specs/2026-09-22-gym-tracker-phase3b-progress-dashboard-design.md` | `.../plans/2026-09-22-gym-tracker-phase3b-progress-dashboard.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase3b-progress-dashboard/` |
| 4A | AI Routine Generation | Done (merged) | `.../specs/2026-09-22-gym-tracker-phase4a-ai-routine-generation-design.md` | `.../plans/2026-09-22-gym-tracker-phase4a-ai-routine-generation.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase4a-ai-routine-generation/` |
| 4B | AI Personalization | Done (merged) | `.../specs/2026-09-25-gym-tracker-phase4b-ai-personalization-design.md` | `.../plans/2026-09-25-gym-tracker-phase4b-ai-personalization.md` | `.superpowers/sdd/2026-09-25-gym-tracker-phase4b-ai-personalization/` |
| 5 | Launch Infrastructure | Done (pending merge) | `.../specs/2026-09-27-gym-tracker-phase5-launch-infrastructure-design.md` | `.../plans/2026-09-27-gym-tracker-phase5-launch-infrastructure.md` | `.superpowers/sdd/2026-09-27-gym-tracker-phase5-launch-infrastructure/` |

Paths above are relative to repo root; `.../` = `docs/superpowers`.

## Remaining phases

- **3A — Tracking + Gamification** (Done; depends on 2). Workout-history list/browse + read-only detail, streaks / XP / badges / weekly goal, PR detection/marking, stats + achievements APIs, dashboard stats header, completion celebration, and a nightly stats-repair job. Server-side stats cached in `UserStats`.

> **Deploy note (3A):** existing users have no `UserStats` row until they complete a session or the nightly job runs. Run `pnpm job:repair-stats` (or schedule `POST /api/jobs/repair-stats` with `x-job-secret`) once after deploying to backfill.
- **3B — Progress Dashboard** (Done; depends on 3A). Dashboard charts, muscle heatmap, PR views, and a body-metric log.
- **4A — AI Routine Generation** (Done, merged; depends on 2, 3A, 3B). Provider-agnostic OpenAI-compatible generation via a pg-boss job queue, strict structured-output validation with bounded repair retries, catalog resolution with a custom-exercise fallback, a deterministic template fallback, provenance, and a safety disclaimer.

> **Deploy note (4A):** run the worker as a separate process (`pnpm worker:ai`, e.g. a dedicated Coolify process). pg-boss creates a `pgboss` schema on boot. With `AI_*` unset, generation uses the deterministic template fallback, so the feature still works without a provider.
- **4B — AI Personalization** (Done, merged; depends on 4A). History-driven load tuning from recent completed working sets, an opt-out `personalize` toggle (default on), and provenance on the result. No operational/deploy change (no worker or env changes).
- **5 — Launch Infrastructure** (Done, pending merge; depends on 4B). Covers 5A (AI worker deployment: a `worker` Docker target, Sentry error reporting, and the Coolify second-application runbook) and 5B (first-deploy seed: a `seed` Docker target and a pinned `free-exercise-db` dataset with a first-deploy runbook). Deployment only; no application behavior change.

> **Deploy note (5):** the seed task fetches the pinned dataset over the network at run time, so it must run on a network with outbound egress.

## How to continue (next phase)

No further phases planned; next is release hardening.

1. Start a fresh session and point it at this file.
2. Harden for release (observability, rate limits, backups, provider config, smoke tests). Use the `brainstorming` skill to explore intent, then write a spec under `docs/superpowers/specs/`.
3. Derive an implementation plan under `docs/superpowers/plans/` (use `writing-plans`).
4. Execute with `subagent-driven-development`: fresh implementer subagent per task, independent reviewer per task, fix rounds (≤5), one final whole-branch review, then `finishing-a-development-branch`. Keep the audit trail in `.superpowers/sdd/<plan-slug>/`.

## Environment & commands

- Node 24, pnpm. Docker Desktop CLI may not be on PATH: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`, then `docker compose up -d db`; seed with `pnpm db:seed`.
- Prisma **7**: import `prisma` from `@/lib/prisma`; types from `@/generated/prisma/client` (never `@prisma/client`); CLI config is `prisma7.config.ts`. When `prisma migrate dev` wants interactive confirmation, use `prisma migrate diff` + `pnpm db:deploy`.
- Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` (needs Docker db + seed), `pnpm test:coverage`, `pnpm build`, `pnpm e2e` (Playwright).
