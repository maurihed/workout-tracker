# Gym Tracker — Design Spec

- **Date:** 2026-09-22
- **Status:** Approved (design), pending implementation planning
- **Author:** Mauricio Hernandez (with opencode)
- **Related:** Phase 1 implementation plan (to be produced via writing-plans)

## 1. Objective

Make it easy to follow a workout routine and see progress over time, with the app
**gamified** so that consistency is rewarding. The product is a mobile-first web app
(PWA) for people who train in a gym or at home.

### Success criteria

- A new user can sign in, onboard (goal, experience, equipment, units, timezone),
  and start their first workout in under 3 minutes.
- A user can run a routine end-to-end without leaving the app: see each exercise's
  details and media, navigate to the next exercise easily, track elapsed workout
  time, and use rest/interval timers.
- Workout days/weeks are tracked and a **scheduled-day streak** is shown and
  celebrated.
- Users can view and customize routines, and ask the AI for a personalized routine.
- The dashboard communicates progress (volume, PRs, consistency, muscle balance).

### Non-goals (explicitly out of scope)

- Social features (following other users, public feeds, comments).
- Nutrition/calorie tracking.
- Native iOS/Android apps (we ship a PWA).
- Coaching marketplace / payments / subscriptions.
- Real-time multiplayer or wearables integration.

Anything not listed in section 4 (Scope) is out of scope for the phased plan and
must be raised as a change request.

## 2. Personas

- **Primary — "Consistent beginner":** trains 2–4×/week, needs structure, responds
  to streaks and simple progress feedback, often on a phone at the gym with
  unreliable connectivity.
- **Secondary — "Intermediate optimizer":** trains 4–6×/week, wants progressive
  overload hints, PR tracking, volume and muscle-balance analytics, and to
  customize routines precisely.
- **Tertiary — "Home trainer":** limited equipment, needs equipment-aware routine
  generation and bodyweight alternatives.

## 3. Glossary

| Term | Meaning |
|---|---|
| **Routine** | A named program with one or more scheduled days (e.g. "Upper/Lower"). |
| **RoutineDay** | A training day within a routine, mapped to a weekday (e.g. Monday = "Push"). |
| **RoutineExercise** | A prescription inside a RoutineDay (sets, reps, rest, timer). |
| **WorkoutSession** | A single performed workout, with an immutable snapshot. |
| **SessionExercise / SetLog** | The performed exercises and individual sets inside a session. |
| **Hit day** | A scheduled weekday on which the user completed a session. |
| **Streak** | Consecutive hit days; rest days and non-training weekdays are neutral. |
| **Catalog** | The seeded `free-exercise-db` exercise set plus user-created custom exercises. |

## 4. Scope

### 4.1 Functional scope

1. **Auth/login** — OAuth (Google, Facebook) via Auth.js.
2. **Onboarding** — collect profile + preferences, then pick or generate a first routine.
3. **Routines** — view, create, edit, customize, delete, activate/deactivate.
4. **Exercises** — browse/search/filter the catalog, view details + media, create custom exercises.
5. **Live workout runner** — exercise-by-exercise flow, swap/skip, notes, elapsed time, rest timer, interval/circuit timer, previous-performance hints, pause/resume/discard, offline-capable.
6. **Tracking** — session logging with immutable snapshots, workout history.
7. **Gamification** — scheduled-day streak, streak freeze, XP & levels, badges/achievements, weekly goal.
8. **Dashboard** — workout statistics and progress charts.
9. **AI routines** — personalized routine generation from user data and equipment.

### 4.2 Phasing

| Phase | Name | Contents | Depends on |
|---|---|---|---|
| **1** | Foundation | Scaffold, design system, code conventions, Prisma schema + migrations, Auth.js, Profile, exercise catalog seed + API, i18n scaffold, CI/CD, Dockerfile, backups, observability, legal pages | — |
| **1.5** | Onboarding | Profile wizard → pick/generate first routine; activation metrics | 1 |
| **2** | Routines + Runner | Routine CRUD/customize, exercise browser, live runner, rest + interval timers, PWA/offline logging | 1, 1.5 |
| **3** | Tracking + Gamification | Session logging w/ snapshots, streak/XP/badges/weekly goal, dashboard charts, heatmap, PRs, body-metric log | 2 |
| **4** | AI | Generation pipeline, personalization, job queue, structured output + fallback, provenance, safety | 2, 3 |

Each phase is shippable on its own and gets its own implementation plan.

## 5. Architecture

### 5.1 Shape

Single Next.js (App Router) application, **client-first**: Server Components render
static shells/layouts for fast first paint, while **all data** flows through
`app/api/*` Route Handlers consumed by **axios + TanStack Query**. This matches the
requested stack and keeps one consistent data model for the client, the PWA/offline
layer, and future native clients.

```
Browser (React 19, PWA)
  ├─ React Query  ── axios ──► app/api/* Route Handlers ──► services ──► Prisma ──► Postgres (Coolify)
  ├─ Zustand (ephemeral runner/timer/theme state)
  ├─ IndexedDB (offline session queue) ──► sync on reconnect ──► app/api/*
  └─ Service Worker (Serwist): app shell + catalog/media cache + background sync
```

### 5.2 Request flow (layering — SOLID)

```
Route Handler (thin: parse/validate, auth gate, map errors, HTTP status)
  → Service (business rules, orchestration, transactions)
    → Repository (Prisma queries only)
      → Postgres
```

- Route handlers never contain business logic or Prisma calls.
- Services are framework-agnostic and unit-testable.
- Repositories isolate persistence so the domain does not depend on Prisma types directly.

## 6. Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + React + TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| Server state | TanStack Query + axios |
| Client state | Zustand (persisted where needed) |
| Forms | react-hook-form + Zod (shared client/server schemas) |
| DB / ORM | PostgreSQL + Prisma |
| Auth | Auth.js v5 + Prisma adapter (database sessions) |
| i18n | next-intl (EN + ES) |
| Charts | shadcn charts (Recharts) |
| Offline | Serwist (service worker) + IndexedDB (`idb`) |
| AI (Phase 4) | Ollama/Qwen via HTTP; pg-boss job queue |
| Tests | Vitest + React Testing Library + Playwright (+ MSW) |
| Lint/format | ESLint + Prettier |
| Deploy | Dockerfile → Coolify (self-hosted VPS), self-hosted Postgres on Coolify |

Node version is pinned via `.nvmrc` and `engines`. Package manager: **pnpm**
(single lockfile, fast CI).

## 7. Project structure

```
gym/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed/                 # catalog import (free-exercise-db) + achievements, idempotent
├─ public/                  # icons, manifest, placeholder exercise image
├─ src/
│  ├─ app/
│  │  ├─ [locale]/          # localized routes
│  │  │  ├─ (auth)/login/
│  │  │  ├─ (app)/          # protected shell + bottom nav
│  │  │  │  ├─ dashboard/ routines/ workout/ progress/ profile/
│  │  │  │  ├─ onboarding/
│  │  │  │  └─ layout.tsx
│  │  │  ├─ legal/privacy/ legal/terms/
│  │  │  ├─ layout.tsx  globals.css
│  │  ├─ api/
│  │  │  ├─ auth/[...nextauth]/route.ts
│  │  │  ├─ health/route.ts
│  │  │  ├─ exercises/ profile/ routines/ sessions/ stats/ me/ export/ 
│  │  │  └─ ai/jobs/ (Phase 4)
│  │  └─ providers.tsx
│  ├─ features/            # one folder per domain: components/, hooks/, api/, schemas/, lib/, stores/, types.ts
│  │  ├─ auth/ profile/ onboarding/ exercises/ routines/ workouts/ progress/ gamification/ ai/
│  ├─ components/
│  │  ├─ ui/               # shadcn primitives (generated)
│  │  └─ shared/           # app-wide composites (AppShell, BottomNav, EmptyState, ErrorState…)
│  ├─ hooks/               # generic reusable hooks (useMediaQuery, useInterval…)
│  ├─ stores/              # cross-feature Zustand stores
│  ├─ lib/                 # prisma.ts, auth.ts, axios.ts, api-client.ts, api-error.ts, rate-limit.ts, utils.ts
│  ├─ i18n/                # config + messages/{en,es}.json
│  ├─ server/              # services/ and repositories/ (server-only)
│  └─ types/               # shared ambient/global types
├─ design-system/gym-tracker/MASTER.md
├─ tests/e2e/
├─ docker/                 # entrypoint, init scripts
├─ docker-compose.yml
├─ Dockerfile
├─ .github/workflows/ci.yml
├─ .env.example
└─ docs/superpowers/specs/
```

### Component & hook rules

- **No large components.** Each component has a single responsibility; page files
  compose feature components and hold no logic.
- **One hook per query/mutation**, co-located in the owning feature
  (`useRoutines`, `useCreateRoutine`, `useStartSession`, …). Query keys are defined
  in one place per feature.
- **Encapsulate logic in hooks/lib** rather than repeating it; pure domain math
  (streak, week, volume, 1RM, timers) lives in `features/*/lib` and is unit-tested.
- **No prop drilling beyond one level**: use composition, feature Zustand stores, or
  React Context (auth/i18n/theme only).

## 8. Data model (Prisma / PostgreSQL)

Designed once; tables are migrated per phase to avoid churn. Postgres array columns
are used for muscle lists and instructions.

### 8.1 Auth (Auth.js adapter)

`User`, `Account`, `Session`, `VerificationToken` per the Auth.js Prisma schema,
with `Account`/`Session` cascading on user delete. Database session strategy.

### 8.2 Domain models

**Profile** (1:1 User)
`birthYear`, `heightCm`, `weightKg`, `gender`, `experience`, `goal`, `unitSystem`
(metric/imperial), `timezone` (IANA string, e.g. `America/Mexico_City`),
`weekStartsOn`, `daysPerWeek`, `notificationsEnabled`, `onboardedAt`.

> Timezone is authoritative for streak day boundaries. All "is this a hit day"
> calculations convert timestamps to the user's timezone.

**Equipment** (global) + **UserEquipment** (per profile)
`Equipment`: `slug`, `name`, `category`.
`UserEquipment`: `profileId`, `equipmentId`, `location` (gym/home/both).

**Exercise**
`sourceId` (free-exercise-db `id`, unique; custom exercises use uuid), `name`,
`nameEs?`, `force?`, `level?`, `mechanic?`, `equipment?`, `category?`,
`primaryMuscles[]`, `secondaryMuscles[]`, `instructions[]`, `instructionsEs[]?`,
`images[]`, `isCustom`, `createdById?`.
Indexes on `name` (trigram/search) and `primaryMuscles`.

> Catalog limitations confirmed from the source dataset: only two static JPGs per
> exercise, no video, and `force`/`mechanic`/`equipment` may be `null`. Exercise
> descriptions beyond `instructions` do not exist and are generated only for
> AI-created or placeholder exercises.

**Routine → RoutineDay → RoutineExercise**
`Routine`: `userId`, `name`, `description?`, `goal?`, `source` (manual/ai/template),
`isActive`.
`RoutineDay`: `routineId`, `weekday` (0=Sun…6=Sat), `label?` (e.g. "Push"), `order`.
`RoutineExercise`: `routineDayId`, `exerciseId?` or `customName?`, `order`,
`targetSets`, `targetReps` (string, supports ranges), `restSeconds`, `targetWeightKg?`,
`timerType` (none/interval/emom/amrap), `workSeconds?`, `rounds?`, `notes?`.

**WorkoutSession → SessionExercise → SetLog**
`WorkoutSession`: `userId`, `routineId?`, `routineDayId?`, `name`, `status`
(in_progress/completed/abandoned), `startedAt`, `completedAt?`, `activeSeconds`,
`notes?`, **`snapshot` (JSON, immutable)**.
`SessionExercise`: `sessionId`, `exerciseId?`, `order`, `nameSnapshot`,
`targetSets?`, `targetReps?`, `restSeconds?`, `completed`, `swappedFromExerciseId?`.
`SetLog`: `sessionExerciseId`, `setNumber`, `type` (warmup/working/drop/failure),
`reps?`, `weightKg?`, `durationSeconds?`, `distanceMeters?`, `rpe?`,
`restSecondsLogged?`, `completedAt?`.

> **History integrity:** on completion, `snapshot` captures exercise names,
> prescriptions, and order as JSON. Editing or deleting a routine never alters past
> sessions. Sessions use client-generated UUIDs so offline replay is idempotent.

**UserStats** (denormalized, 1:1 User)
`currentStreak`, `longestStreak`, `lastHitDate?`, `streakFreezes`, `totalSessions`,
`totalVolumeKg`, `xp`, `level`, `weeklyGoal`.

**Gamification**
`Achievement` (seeded, bilingual name/description, `icon`, `criteria` JSON, `xpReward`),
`UserAchievement` (composite PK, `unlockedAt`), `XpEvent` (`amount`, `reason`,
`refType?`, `refId?`, `createdAt`).

**BodyMetric** (Phase 3)
`userId`, `recordedOn`, `weightKg?`, `bodyFatPct?`, unique `[userId, recordedOn]`.

**AiJob** (Phase 4)
`userId`, `status` (queued/running/succeeded/failed/cancelled), `input` JSON,
`result` JSON?, `model?`, `promptVersion?`, `error?`, `createdAt`, `startedAt?`,
`finishedAt?`.

### 8.3 Streak rules (authoritative)

1. Convert `completedAt` to the user's `timezone` to derive the calendar date.
2. A date is a **hit** if the user completed ≥1 session and that date falls on a
   `RoutineDay.weekday` of the active routine **at the time of completion**.
3. If the user has no active routine, any completed session counts as a hit.
4. Weekday values: `0`=Sunday … `6`=Saturday; `weekStartsOn` affects display only.
5. Rest days / non-scheduled weekdays are **neutral** (do not break the streak).
6. A missed scheduled day breaks the streak unless a **streak freeze** is applied
   (consumes one freeze; a freeze cannot be applied retroactively beyond 48h).
7. Multiple sessions on the same date count once.
8. `currentStreak`/`longestStreak`/`lastHitDate` are recomputed from sessions in a
   service and stored in `UserStats`; a nightly job (Phase 3) repairs drift.

## 9. Authentication & authorization

- Auth.js v5, Prisma adapter, **database sessions**, providers: **Google** and
  **Facebook**. No passwords are stored.
- Provider profile data seeds `User.name`/`image`; `Profile` is created on first
  sign-in (a stub) and completed in onboarding.
- Account email linking: use the adapter's email linking; enable
  `allowDangerousEmailAccountLinking` only per-provider after verifying provider
  email verification semantics (documented decision in the plan).
- Middleware protects `/[locale]/(app)/*` and all non-public `/api/*` routes.
- Authorization is always scoped by `userId` in services/repositories; route
  handlers obtain the session and pass `userId` down — never trust client-sent ids.
- Session revocation supported via database sessions; a "sign out everywhere"
  action deletes the user's sessions.

## 10. API conventions

- Base path `/api`. Route handlers are thin; validation via shared Zod schemas.
- **Success:** `200/201` with `{ "data": <payload> }`.
- **Error:** appropriate status with `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- Error codes are a typed union in `lib/api-error.ts`; a shared `toApiError`
  maps thrown domain errors (`NotFoundError`, `ValidationError`, `ForbiddenError`,
  `ConflictError`, `RateLimitError`) to HTTP status.
- The client uses a single axios instance (`lib/axios.ts`) with interceptors for
  auth, error normalization, and request ids; React Query hooks surface errors via
  toast notifications (`sonner`).
- Pagination is cursor-based (`?cursor=&limit=`) where lists can grow (sessions, exercises).

## 11. State ownership (no overlap)

| State kind | Owner |
|---|---|
| Server data (routines, catalog, sessions, stats, profile) | TanStack Query |
| Ephemeral UI/session state (active runner index, timer ticks, set drafts, theme) | Zustand (persisted to localStorage/IndexedDB where needed) |
| Shareable UI state (filters, tabs, pagination) | URL search params |
| Cross-cutting ambient (auth session, i18n locale, color theme) | React Context (provider components) |

## 12. Design system

Sourced from the `ui-ux-pro-max` skill and persisted to
`design-system/gym-tracker/MASTER.md`.

- **Style:** Vibrant & Block-based — bold blocks, geometric shapes, high contrast,
  energetic; explicitly anti-"two colors" and anti-static.
- **Colors:** primary orange `#F97316`, accent success green `#22C55E`, plus
  secondary violet and amber for category coding. Full **light and dark** token sets
  via CSS variables consumed by Tailwind and shadcn.
- **Typography:** headings `Barlow Condensed`, body `Barlow` (self-hosted via `next/font`).
- **Layout:** mobile-first, 4/8px spacing rhythm, bottom tab navigation (5 tabs),
  safe-area aware, ≥44px touch targets.
- **Motion:** 150–300ms transitions, gamification feedback (XP bar fills, streak
  flame, completion confetti), respects `prefers-reduced-motion`.
- **Quality gates:** WCAG AA contrast in both themes, visible focus states, vector
  icons only (Phosphor/Heroicons — no emoji as icons), responsive at 375/768/1024/1440.

## 13. Internationalization

- `next-intl` with locale-prefixed routes (`/[locale]/...`); API routes are not localized.
- Locales: `en` (default), `es`. Dictionaries in `src/i18n/messages/{en,es}.json`.
- Locale resolved by URL prefix with `Accept-Language` fallback; user choice persists.
- Catalog fields with `nameEs`/`instructionsEs` prefer Spanish when locale is `es`;
  otherwise fall back to English and show a "translated by AI" note where applicable.
- All user-facing strings come from dictionaries — no hardcoded copy in components.

## 14. Offline & PWA

- **Serwist** generates the service worker: precache the app shell; runtime cache
  `stale-while-revalidate` for catalog/API GETs; cache images with an LRU strategy.
- **IndexedDB queue** (`idb`) records session events (start, set logs, completion)
  with client-generated UUIDs; flushes to `/api/sessions/*` on reconnect and via
  Background Sync when supported, otherwise on `online`.
- The **active workout session is persisted locally**, so a reload or loss of
  connectivity never loses data; the runner works fully offline once the routine
  and catalog are cached.
- Conflict handling is idempotent upsert by client id (server timestamp wins on
  completedAt; set logs are append-only).
- Web app manifest enables "Add to Home Screen"; offline indicator surfaces sync state.

> Note: service workers are used for **caching/offline/sync only**. Long-running AI
> generation is handled server-side by a job queue (Phase 4), never in the SW.

## 15. Gamification model

- **Streak:** scheduled-day streak per §8.3, with streak freeze.
- **XP & levels:** XP awarded for completing sessions, hitting weekly goal, PRs, and
  streaks; level curve defined in `features/gamification/lib/level.ts` (pure, tested).
  All XP changes recorded as `XpEvent` for auditability.
- **Achievements/badges:** seeded catalog (e.g. first workout, 7-day streak,
  10 sessions, 100k kg volume, muscle-group milestones). Unlock evaluation runs in
  the session-completion service; unlocked badges are celebrated in the UI.
- **Weekly goal:** user-set sessions/week (default 3); progress shown on dashboard
  and weekly streak contribution.
- **Celebrations:** confetti + XP toast on completion; badge unlock modal; streak
  milestone animation.

## 16. AI subsystem (Phase 4)

- **Provider:** Ollama/Qwen over HTTP. Deployment decision (GPU VPS vs
  user-machine local vs hosted inference) is a Phase 4 spike with a recommendation.
- **Generation contract:** the model must return JSON validated against a Zod schema
  (routine name, days, exercises referenced by catalog `sourceId`, sets/reps/rest,
  timer config). Invalid/partial output triggers bounded retries with repair prompts.
- **Exercise resolution:** model output references catalog ids; unknown names are
  matched fuzzily to the catalog; unmatchable exercises become custom exercises with
  a placeholder image and an AI-generated explanation (per requirements).
- **Fallback:** deterministic template routines by goal/experience/equipment when the
  model is unavailable, so the feature never hard-fails.
- **Job lifecycle:** `AiJob` rows + **pg-boss** (Postgres-backed, no extra Redis);
  states queued→running→succeeded/failed/cancelled; timeout and bounded retries;
  per-user quota and rate limiting; cancel support.
- **UX:** client polls job status (or SSE) with progress; result is previewed and
  must be accepted/saved by the user before becoming a routine.
- **Provenance:** store model, prompt version, and input snapshot on the routine/AiJob.
- **Safety:** output is presented as suggestions, not medical advice; include an
  injury/health disclaimer and require user confirmation.

## 17. Infrastructure & DevOps

### 17.1 Local development

- `docker-compose.yml`: Postgres service (for developers who prefer local) plus an
  optional app service. Developers install Docker Desktop.
- `.env.example` documents every variable; `.env` is git-ignored.

### 17.2 Environments & configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (separate DBs per environment) |
| `AUTH_SECRET`, `AUTH_URL` | Auth.js |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | Facebook OAuth |
| `SENTRY_DSN` | Error tracking |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | AI (Phase 4) |
| `RATE_LIMIT_*` | Rate limiting thresholds |

Local dev points at a **separate development database** on Coolify; production data
is never used locally.

### 17.3 Build & deploy

- **Dockerfile:** multi-stage (deps → build → runner) using Next.js `output: standalone`,
  Node 22 LTS pinned via `.nvmrc`/`engines`, non-root user, `HEALTHCHECK` against `/api/health`.
- **Coolify:** builds the Dockerfile, runs `prisma migrate deploy` as a pre-deploy/release
  command, injects secrets, and auto-deploys on push to `main`.
- **CI (GitHub Actions):** on PR/push — install (pnpm, cached), lint, typecheck, unit
  tests, Playwright e2e, `next build`, and a Prisma migration drift check against a
  throwaway Postgres service. CI must pass before deploy.

### 17.4 Backups & operations

- **Backups:** scheduled `pg_dump` (Coolify scheduled task or cron) to object storage,
  30-day retention, encrypted; **quarterly restore drill** verified and documented.
- **Observability:** `/api/health` (DB connectivity), Sentry (`@sentry/nextjs`) for
  client + server errors, structured JSON logs (`pino`), uptime monitor on `/api/health`.
- **Seeding:** idempotent (`upsert`) so re-running never duplicates catalog/achievements.

### 17.5 Security

- Security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options)
  via `next.config`.
- Rate limiting on auth callbacks and AI endpoints (Postgres-backed token bucket,
  since no Redis is provisioned); stricter per-user quota for AI.
- Auth.js CSRF protection; secrets only in Coolify env; no secrets in repo or logs.
- HTTPS terminated at Coolify/Traefik.

### 17.6 Privacy & legal

- Privacy policy and Terms of Service pages (`/[locale]/legal/*`).
- Explicit consent for storing health/personal data; documented data-retention stance.
- **Data export** endpoint returns the user's data as JSON; **account deletion**
  hard-deletes the user and cascades all related rows. Both exposed in profile settings.

## 18. Exercise media

- Catalog images are two static JPGs per exercise (`0.jpg`, `1.jpg`), from
  `free-exercise-db` (public domain / Unlicense).
- Serve via a **self-hosted/optimized** path: at seed time, download images into
  `public/` (or an object store) and serve through Next Image — do **not** depend on
  `raw.githubusercontent.com` at runtime (rate-limited, not a CDN).
- Missing/invalid images fall back to a local placeholder; custom/unmatched exercises
  always use the placeholder plus an AI-generated text description.

## 19. Testing strategy

- **Pure domain logic** (`features/*/lib`: streak, week, volume, 1RM, level, timer
  math) — Vitest unit tests, high coverage. These are the highest-value tests.
- **Services/repositories** — integration tests against a disposable test database.
- **Hooks & components** — React Testing Library + MSW; assert behavior and
  accessibility (roles/labels), not implementation details.
- **E2E** — Playwright on critical paths: auth (mocked OAuth), onboarding,
  start → complete a workout, streak/XP update, routine edit does not change history.
- Coverage thresholds set in Vitest config; CI fails below threshold.

## 20. Risks & open questions

| # | Risk / question | Mitigation / decision point |
|---|---|---|
| 1 | Ollama on a GPU-less VPS is impractical | Phase 4 spike: GPU VPS vs user-machine local vs hosted inference |
| 2 | Facebook OAuth requires app review for public use | Fine in dev; plan review before public launch |
| 3 | Remote dev database could collide with prod | Use a distinct dev database; never point local at prod |
| 4 | free-exercise-db fields nullable / 2 images only | Handle nulls; placeholder image; AI text for gaps |
| 5 | AI structured output may be invalid | Zod validation + retries + deterministic template fallback |
| 6 | Offline sync conflicts | Client UUIDs + idempotent upsert + append-only set logs |
| 7 | Image hosting cost/bandwidth | Self-host + Next Image optimization + LRU cache |
| 8 | Rate limiting without Redis | Postgres-backed limiter (single VPS assumption) |
| 9 | Health data privacy | Legal pages, consent, export/deletion, encryption in transit |
| 10 | Streak timezone travel edge cases | Authoritative user timezone + 48h freeze window + nightly repair job |

## 21. Phase acceptance criteria

- **Phase 1:** app builds and deploys via Coolify; Google/Facebook login works;
  a `Profile` exists for every user with timezone/units; the exercise catalog is
  seeded and searchable via API; EN/ES switch works; CI green (lint, typecheck, tests,
  build, migration check); health endpoint, Sentry, and backups configured; legal
  pages reachable.
- **Phase 1.5:** a new user completes onboarding and reaches a first routine.
- **Phase 2:** a user can create/customize a routine and run it end-to-end offline,
  with rest and interval timers and exercise navigation.
- **Phase 3:** sessions are logged with immutable snapshots; streak/XP/badges update
  correctly (unit-tested); dashboard shows charts, heatmap, and PRs.
- **Phase 4:** an AI job generates a validated, personalized routine with a working
  fallback and safety disclaimer; users can save it as a routine.

## 22. Traceability to requirements

| Requirement | Covered by |
|---|---|
| Track workout days | §8.2 sessions, §8.3 streak, §15 |
| View/customize routines | §4.2 Phase 2, §8.2 routine models |
| Live routine runner + time + timers | §4.2 Phase 2, §8.2 timer fields, §21 |
| AI routines + personalization | §16, §4.2 Phase 4 |
| Auth/login | §9 |
| Dashboard statistics | §4.2 Phase 3, §15 |
| Streak (days/weeks) | §8.3, §15 |
| Next.js/TS/Tailwind/shadcn/axios/React Query/Zustand/Postgres/Prisma/Docker/Coolify | §6, §17 |
| Service workers (adapted) | §14 |
| free-exercise-db + placeholder + explanation | §8.2, §18 |
| SOLID / small components / hooks / no prop drilling | §5.2, §7 |
| ui-ux-pro-max, mobile-first, trending, multi-color, dark/light | §12 |
