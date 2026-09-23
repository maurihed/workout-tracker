# Gym Tracker — Roadmap & Status

Single entry point for picking up work in a fresh session.

- **Product spec (binding authority):** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md`
- **Current branch:** `main` — last shipped commit is the tip of `main`.
- **Delivery process:** per-phase → brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → subagent-driven TDD execution, with an audit trail in `.superpowers/sdd/<plan-slug>/`.

## Phase status

| Phase | Name | Status | Spec | Plan | SDD workspace |
|---|---|---|---|---|---|
| 1 | Foundation | Done (merged) | `.../specs/2026-09-22-gym-tracker-design.md` §4.2 | `.../plans/2026-09-22-gym-tracker-phase1-foundation.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase1-foundation/` |
| 1.5 | Onboarding | Done (merged) | `.../specs/2026-09-22-gym-tracker-phase1.5-onboarding-design.md` | `.../plans/2026-09-22-gym-tracker-phase1.5-onboarding.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase1.5-onboarding/` |
| 2A | Routine Builder | Done (merged) | `.../specs/2026-09-22-gym-tracker-phase2a-routine-builder-design.md` | `.../plans/2026-09-22-gym-tracker-phase2a-routine-builder.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase2a-routine-builder/` |
| 2B | Workout Runner & Timers | Done (merged) | `.../specs/2026-09-22-gym-tracker-phase2b-workout-runner-design.md` | `.../plans/2026-09-22-gym-tracker-phase2b-workout-runner.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase2b-workout-runner/` |
| 2C | PWA / Offline | Done (merged) | `.../specs/2026-09-22-gym-tracker-phase2c-pwa-offline-design.md` | `.../plans/2026-09-22-gym-tracker-phase2c-pwa-offline.md` | `.superpowers/sdd/2026-09-22-gym-tracker-phase2c-pwa-offline/` |
| 3 | Tracking + Gamification | **Not started** | — | — | — |
| 4 | AI | **Not started** | — | — | — |

Paths above are relative to repo root; `.../` = `docs/superpowers`.

## Remaining phases

- **3 — Tracking + Gamification** (depends on 2). Workout-history list/browse, streaks / XP / badges / weekly goal, dashboard charts, muscle heatmap, PR detection, body-metric log. Core session logging (snapshots) already exists from 2B. Server-side stats cached in `UserStats` with a nightly repair job.
- **4 — AI** (depends on 2, 3). Generation pipeline via Ollama/Qwen + pg-boss job queue, personalization, structured output validation + fallback, provenance, safety disclaimer. Includes a spike on inference hosting (GPU VPS vs local vs hosted).

## How to continue (next phase)

1. Start a fresh session and point it at this file.
2. Pick the next phase (**3** unless told otherwise). Use the `brainstorming` skill to explore intent, then write the phase spec under `docs/superpowers/specs/`.
3. Derive an implementation plan under `docs/superpowers/plans/` (use `writing-plans`).
4. Execute with `subagent-driven-development`: fresh implementer subagent per task, independent reviewer per task, fix rounds (≤5), one final whole-branch review, then `finishing-a-development-branch`. Keep the audit trail in `.superpowers/sdd/<plan-slug>/`.

## Environment & commands

- Node 24, pnpm. Docker Desktop CLI may not be on PATH: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`, then `docker compose up -d db`; seed with `pnpm db:seed`.
- Prisma **7**: import `prisma` from `@/lib/prisma`; types from `@/generated/prisma/client` (never `@prisma/client`); CLI config is `prisma7.config.ts`. When `prisma migrate dev` wants interactive confirmation, use `prisma migrate diff` + `pnpm db:deploy`.
- Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` (needs Docker db + seed), `pnpm test:coverage`, `pnpm build`, `pnpm e2e` (Playwright).
